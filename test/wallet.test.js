import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { ethers } from 'ethers'
import dotenv from 'dotenv'

const root = fileURLToPath(new URL('..', import.meta.url))
// Public test-only key; no user wallet or live network is used.
const key = '0x' + '11'.repeat(32)
const address = new ethers.Wallet(key).address

function fixture(t, files = {}, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagclaw-wallet-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  for (const name of ['src', 'bin', 'package.json']) {
    fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true })
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content)
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(TAGCLAW_|CLAY_|AGENT_TOKEN$)/.test(name)
  ))
  Object.assign(env, overrides)
  function run(args) {
    return spawnSync(process.execPath, args, { cwd: dir, env, encoding: 'utf8', timeout: 20000 })
  }
  return {
    dir,
    cli: (...args) => run(['bin/wallet.js', ...args]),
    script: code => run(['--input-type=module', '-e', code]),
    saved: () => dotenv.parse(fs.readFileSync(path.join(dir, '.env')))
  }
}

function success(result) {
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim().split('\n').length, 1)
  return JSON.parse(result.stdout)
}

test('new CLI wallet persists local keys securely, signs offline, and survives repeated setup', t => {
  const f = fixture(t, { '.env': '# keep this\nTAGCLAW_API_KEY=test-api-key\n' })
  const created = success(f.cli('create-wallet'))
  const saved = f.saved()
  assert.equal(created.backend, 'local')
  assert.equal(saved.TAGCLAW_WALLET_BACKEND, 'local')
  assert.equal(new ethers.Wallet(saved.TAGCLAW_PRIVATE_KEY).address, created.address)
  assert.equal(saved.TAGCLAW_API_KEY, 'test-api-key')
  assert.ok(saved.TAGCLAW_STEEM_POSTING_PRI)
  assert.ok(!JSON.stringify(created).includes(saved.TAGCLAW_PRIVATE_KEY))
  assert.ok(!JSON.stringify(created).includes(saved.TAGCLAW_STEEM_POSTING_PRI))
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(f.dir, '.env')).mode & 0o777, 0o600)
  }
  assert.equal(success(f.cli('init-wallet')).address, created.address)
  assert.deepEqual(f.saved(), saved)
  assert.equal(success(f.cli('address')).address, created.address)
  const signature = success(f.cli('sign', '--message', 'offline')).signature
  assert.equal(ethers.verifyMessage('offline', signature), created.address)
  assert.equal(success(f.cli('steem-keys')).postingPri, saved.TAGCLAW_STEEM_POSTING_PRI)
  assert.equal(success(f.cli('sync-env')).backend, 'local')
})

test('local environment import uses original Steem derivation and transaction signer', t => {
  const f = fixture(t, {}, { TAGCLAW_PRIVATE_KEY: key })
  success(f.cli('init-wallet'))
  assert.equal(f.saved().TAGCLAW_ETH_ADDR, address)
  const result = f.script(`
    import { generateSteemKeys } from './src/index.js';
    import { resolveWriteSigner } from './src/claw.js';
    const signer = await resolveWriteSigner();
    const tx = await signer.signTransaction({ to: '${address}', value: 1n, nonce: 0, gasLimit: 21000, gasPrice: 1n, chainId: 56 });
    console.log(JSON.stringify({ steem: generateSteemKeys('${key}'), tx }));
  `)
  const { steem, tx } = success(result)
  assert.equal(f.saved().TAGCLAW_STEEM_POSTING_PRI, steem.postingPri)
  assert.equal(ethers.Transaction.from(tx).from, address)
})

test('invalid or missing explicit key never falls back or leaks key material', t => {
  const f = fixture(t, {}, { TAGCLAW_PRIVATE_KEY: key })
  for (const args of [['--private-key', 'not-a-secret-key'], ['--private-key'], ['--private-key', '--message', 'x']]) {
    const result = f.cli('sign', ...args)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.ok(!result.stderr.includes('not-a-secret-key'))
  }
  const bad = fixture(t, {}, { TAGCLAW_PRIVATE_KEY: 'bad-local-secret', CLAY_UID: 'existing' })
  const result = bad.cli('sign')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid EVM private key/)
  assert.ok(!result.stderr.includes('bad-local-secret'))
})

test('existing identity without credentials and partial Claw setup cannot be replaced', t => {
  for (const files of [
    { '.env': `TAGCLAW_ETH_ADDR=${address}\n` },
    { '.env': 'TAGCLAW_STEEM_POSTING_PUB=existing\n' },
    { '.env': 'TAGCLAW_WALLET_BACKEND=local\n' },
    { '.env.clay': '# incomplete old install\n' },
    { 'identity.json': '{"uid":"existing"}' }
  ]) {
    const f = fixture(t, files)
    const result = f.cli('init-wallet')
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    for (const [name, content] of Object.entries(files)) {
      assert.equal(fs.readFileSync(path.join(f.dir, name), 'utf8'), content)
    }
    assert.equal(fs.existsSync(path.join(f.dir, '.wallet-init.lock')), false)
  }
})

test('sync refuses changes to existing address or Steem identity', t => {
  for (const line of [
    'TAGCLAW_ETH_ADDR=0x2222222222222222222222222222222222222222',
    'TAGCLAW_STEEM_POSTING_PUB=existing-claw-steem-key'
  ]) {
    const content = `TAGCLAW_PRIVATE_KEY=${key}\n${line}\n`
    const f = fixture(t, { '.env': content })
    const result = f.cli('sync-env')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Refusing to replace/)
    assert.equal(fs.readFileSync(path.join(f.dir, '.env'), 'utf8'), content)
  }
})

test('Claw address, signing, Steem derivation and init remain compatible with the SDK', t => {
  const f = fixture(t, { '.env.clay': 'CLAY_SANDBOX_URL=http://sandbox.test\nCLAY_AGENT_TOKEN=test-token\n', 'identity.json': '{"uid":"test-uid"}' })
  const result = f.script(`
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { ethers } from 'ethers';
    const remote = new ethers.Wallet('${key}');
    const requests = [];
    globalThis.fetch = async request => {
      const url = new URL(request.url);
      requests.push(url.pathname);
      assert.equal(request.headers.get('Authorization'), 'Bearer test-token');
      if (url.pathname === '/api/v1/wallet/status') {
        return Response.json({ addresses: { bsc: remote.address, ethereum: remote.address } });
      }
      if (url.pathname === '/api/v1/tx/sign') {
        const body = await request.json();
        assert.equal(body.uid, 'test-uid');
        assert.equal(body.sign_mode, 'personal_sign');
        return Response.json({ signature_hex: await remote.signMessage(ethers.getBytes(body.tx_payload_hex)) });
      }
      throw new Error('Unexpected sandbox request');
    };
    const wallet = await import('./src/index.js');
    const { resolveWriteSigner } = await import('./src/claw.js');
    const { brainKeyFromSecretHex, steemKeysFromBrainPass } = await import('./src/steem.js');
    assert.equal(await wallet.getClawWalletAddress(), remote.address);
    assert.equal(await wallet.getWalletAddress(), remote.address);
    assert.equal((await resolveWriteSigner()).constructor.name, 'ClawEthersSigner');
    assert.equal(ethers.verifyMessage('compat', await wallet.signMessage(undefined, 'compat')), remote.address);
    const signature = await remote.signMessage(wallet.RegisterSteemMessage);
    const secret = createHash('sha256').update(ethers.getBytes(signature)).digest('hex');
    const expected = steemKeysFromBrainPass(brainKeyFromSecretHex(secret));
    assert.deepEqual(await wallet.generateSteemKeysFromClaw(), expected);
    assert.notDeepEqual(expected, wallet.generateSteemKeys('${key}'));
    const initialized = await wallet.initWallet();
    assert.equal(initialized.backend, 'claw');
    assert.deepEqual(initialized.steemKeys, expected);
    assert.equal((await wallet.initWallet()).address, remote.address);
    console.log(JSON.stringify({ backend: initialized.backend, requests: requests.length }));
  `)
  assert.equal(success(result).backend, 'claw')
  assert.equal(f.saved().TAGCLAW_PRIVATE_KEY, undefined)
  assert.equal(f.saved().TAGCLAW_WALLET_BACKEND, 'claw')
})

test('explicit private key overrides Claw; persisted backend selects Claw when both exist', t => {
  const f = fixture(t, {}, { TAGCLAW_WALLET_BACKEND: 'claw', TAGCLAW_PRIVATE_KEY: key })
  const sig = success(f.cli('sign', '--private-key', key, '--message', 'override')).signature
  assert.equal(ethers.verifyMessage('override', sig), address)
  const result = f.cli('sign', '--message', 'claw')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Claw wallet:/)
})

test('initialization lock prevents concurrent replacement', t => {
  const f = fixture(t, { '.wallet-init.lock': '' })
  const result = f.cli('init-wallet')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /already in progress/)
  assert.equal(fs.existsSync(path.join(f.dir, '.env')), false)
})
