#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'skills/tagclaw-onchain')
const index = process.argv.indexOf('--out')
if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node scripts/export-onchain-skill.mjs --out /website/public/skills/tagclaw-onchain')
const target = path.resolve(process.argv[index + 1])
if (target === source || target.startsWith(source + path.sep)) throw new Error('Output must be outside the canonical skill')
const files = []
function copy(relative) {
  const src = path.join(source, relative), dst = path.join(target, relative), stat = fs.lstatSync(src)
  if (stat.isSymbolicLink()) throw new Error('Do not publish symlinks')
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(src).sort()) if (name !== '.DS_Store' && name !== 'node_modules') copy(path.join(relative, name))
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    const content = fs.readFileSync(src); fs.writeFileSync(dst, content)
    files.push({ path: relative.split(path.sep).join('/'), sha256: createHash('sha256').update(content).digest('hex') })
  }
}
for (const name of ['SKILL.md', 'package.json', 'package-lock.json', 'agents', 'references', 'scripts']) copy(name)
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ skill: 'tagclaw-onchain', version: JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version, files }, null, 2) + '\n')
console.log(JSON.stringify({ destination: target, files: files.length }))
