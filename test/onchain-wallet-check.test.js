import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {walletCheck,REQUIRED_BAW_VERSION} from '../skills/tagclaw-onchain/scripts/lib/wallet-check.mjs'
const from='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20)
function fixture(overrides={}){
 const responses={
  'cli-check':{currentCliVersion:REQUIRED_BAW_VERSION,needUpdateCli:false},
  'wallet status':{status:'CONNECTED'},
  'wallet address':{addresses:[{binanceChainId:'1',address:other},{binanceChainId:'56',address:from}]},
  'wallet settings':{sessionExpireTime:new Date(5000000).toISOString(),developerModeQuotaUsed:25,
   devMode:{enabled:true,expiresAt:4000,dailyLimit:1000,balanceExceeded:false},tradeAllTokens:true,abnormalTxnHandling:'AutoReject',
   sessionToken:'NEVER_PRINT_SESSION',clientId:'NEVER_PRINT_CLIENT'},
  'wallet tx-lock':{status:'UNLOCKED'},'wallet agent-id':{claimed:true,handle:'private-display-name'},...overrides,
 }
 const calls=[]
 const run=async args=>{calls.push(args);const key=args[0]==='cli-check'?'cli-check':args.slice(0,2).join(' ')
  assert.ok(key in responses,`unexpected wallet command ${key}`)
  const result=responses[key];if(result instanceof Error)throw result
  return result?.success===false?result:{success:true,data:result}}
 return {responses,calls,check:input=>walletCheck(input,{run,now:()=>1000})}
}
test('ready wallet checks only official read commands and whitelists public output',async()=>{
 const f=fixture(),r=await f.check({from})
 assert.equal(r.status,'READY_FOR_PREVIEW');assert.equal(r.ready,true);assert.equal(r.canPreview,true)
 assert.equal(r.checks.bscAccount.address,from);assert.equal(r.checks.developerMode.remainingUsd,975)
 assert.equal(r.checks.riskPolicy.abnormalTxnHandling,'AutoReject');assert.equal(r.requiresUserAuthorization,true)
 assert.deepEqual(f.calls[0],['cli-check','--required-version',REQUIRED_BAW_VERSION,'--json'])
 assert.deepEqual(f.calls.at(-1),['wallet','agent-id','--json'])
 assert.ok(f.calls.every(args=>args.at(-1)==='--json'))
 assert.doesNotMatch(JSON.stringify(r),/NEVER_PRINT|sessionToken|clientId|private-display-name/)
})
test('missing CLI and outdated CLI give setup guidance without trying login or execution',async()=>{
 const missing=fixture({'cli-check':Object.assign(new Error('secret failure'),{code:'ENOENT'})})
 const r=await missing.check({});assert.equal(r.status,'BLOCKED');assert.equal(r.issues[0].code,'BAW_NOT_INSTALLED')
 assert.match(r.issues[0].action,/@binance\/agentic-wallet/);assert.equal(missing.calls.length,1)
 const old=fixture({'cli-check':{needUpdateCli:true,currentCliVersion:'1.0.0'}})
 assert.equal((await old.check({})).issues[0].code,'BAW_UPDATE_REQUIRED');assert.equal(old.calls.length,1)
})
test('disconnected/creating wallets stop before settings and never initiate sign-in',async()=>{
 for(const status of ['UNCONNECTED','CREATING','unknown']){
  const f=fixture({'wallet status':{status}}),r=await f.check({})
  assert.equal(r.canPreview,false);assert.equal(r.publicQueriesAvailable,true);assert.equal(f.calls.length,2)
 }
})
test('Developer Mode expiry, balance cap and its own quota block preview',async()=>{
 for(const [change,code] of [[{enabled:false},'DEVELOPER_MODE_DISABLED'],[{expiresAt:999},'DEVELOPER_MODE_EXPIRED_OR_UNKNOWN'],
  [{balanceExceeded:true},'DEVELOPER_BALANCE_CAP_EXCEEDED'],[{dailyLimit:25},'DEVELOPER_QUOTA_UNAVAILABLE']]){
  const f=fixture();Object.assign(f.responses['wallet settings'].devMode,change)
  const r=await f.check({});assert.equal(r.canPreview,false);assert.ok(r.issues.some(i=>i.code===code))
 }
 const f=fixture();delete f.responses['wallet settings'].developerModeQuotaUsed
 f.responses['wallet settings'].defiQuotaUsed=0
 assert.ok((await f.check({})).issues.some(i=>i.code==='DEVELOPER_QUOTA_UNAVAILABLE'))
})
test('restricted token policy is reported for owner review without changing risk policy or pretending all tokens fail',async()=>{
 const f=fixture();f.responses['wallet settings'].tradeAllTokens=false
 const r=await f.check({});assert.equal(r.status,'POLICY_REVIEW');assert.equal(r.ready,false);assert.equal(r.canPreview,true)
 assert.equal(r.checks.riskPolicy.abnormalTxnHandling,'AutoReject')
 assert.ok(r.warnings.some(w=>w.code==='TOKEN_POLICY_REVIEW'))
 assert.ok(f.calls.every(args=>!['auth','contract-call','market-order','sign-message'].includes(args[0])))
})
test('wrong sender, expired session, pending lock and unavailable Agent ID are distinct blockers',async()=>{
 const mismatch=await fixture().check({from:other});assert.ok(mismatch.issues.some(i=>i.code==='SENDER_MISMATCH'))
 const session=fixture();session.responses['wallet settings'].sessionExpireTime=new Date(500).toISOString()
 assert.ok((await session.check({})).issues.some(i=>i.code==='SESSION_EXPIRED_OR_UNKNOWN'))
 const lock=fixture({'wallet tx-lock':{status:'LOCKED'}});assert.ok((await lock.check({})).issues.some(i=>i.code==='WALLET_LOCKED_OR_UNKNOWN'))
 const unclaimed=fixture({'wallet agent-id':{claimed:false}});assert.ok((await unclaimed.check({})).issues.some(i=>i.code==='AGENT_ID_REQUIRED'))
 const failed=fixture({'wallet agent-id':{success:false,error:{code:20003008,message:'SECRET_BACKEND'}}})
 const r=await failed.check({});assert.ok(r.issues.some(i=>i.code==='AGENT_ID_UNAVAILABLE'))
 assert.ok(!r.issues.some(i=>i.code==='AGENT_ID_REQUIRED'));assert.doesNotMatch(JSON.stringify(r),/SECRET_BACKEND/)
})
test('non-trade operations do not impose the token-trade handle requirement',async()=>{
 for(const operation of ['create','ipshare','nutbox','index']){
  const f=fixture({'wallet agent-id':new Error('must not be called')})
  assert.equal((await f.check({operation})).ready,true)
  assert.ok(!f.calls.some(a=>a[1]==='agent-id'))
 }
})
test('malformed responses are not treated as ready and unexpected input cannot change CLI arguments',async()=>{
 const f=fixture({'wallet address':{addresses:[null]},'wallet settings':null,'wallet tx-lock':{status:'UNEXPECTED_SECRET'}})
 const r=await f.check({});assert.equal(r.canPreview,false);assert.doesNotMatch(JSON.stringify(r),/UNEXPECTED_SECRET/)
 for(const input of [{from:'0xINVALID'},{operation:'auth'},{from,command:'execute'},{privateKey:'do not accept'}])await assert.rejects(f.check(input),/INVALID_WALLET_CHECK_INPUT/)
})
test('CLI integration is read-only; query commands never invoke an installed wallet',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tagclaw-wallet-check-')),log=path.join(dir,'commands.jsonl')
 try{
  const responses=fixture().responses
  const script=`#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');const all=${JSON.stringify(responses)};const k=a[0]==='cli-check'?'cli-check':a.slice(0,2).join(' ');if(!all[k])process.exit(9);console.log(JSON.stringify({success:true,data:all[k]}));\n`
  fs.writeFileSync(path.join(dir,'baw'),script,{mode:0o755})
  const cli=fileURLToPath(new URL('../skills/tagclaw-onchain/scripts/tagclaw.mjs',import.meta.url))
  const env={...process.env,PATH:dir+path.delimiter+process.env.PATH}
  // Future settings for the real clock used by the actual CLI process.
  responses['wallet settings'].sessionExpireTime=new Date(Date.now()+86400000).toISOString()
  responses['wallet settings'].devMode.expiresAt=Math.floor(Date.now()/1000)+86400
  fs.writeFileSync(path.join(dir,'baw'),script.replace(JSON.stringify(fixture().responses),JSON.stringify(responses)),{mode:0o755})
  const result=spawnSync(process.execPath,[cli,'wallet-check'],{env,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout)
  assert.equal(report.status,'READY_FOR_PREVIEW');assert.doesNotMatch(result.stdout,/NEVER_PRINT/)
  const before=fs.readFileSync(log,'utf8')
  for(const cmd of ['capabilities','deployments'])assert.equal(spawnSync(process.execPath,[cli,cmd],{env,encoding:'utf8'}).status,0)
  assert.equal(fs.readFileSync(log,'utf8'),before)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
