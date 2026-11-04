'use strict'
// Fails if any relative require/import doesn't match a file's exact case.
// Windows ignores case, Linux (Coolify) doesn't, so this catches deploy crashes locally.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SCAN_DIRS = ['src', 'prisma']
const EXTS = ['', '.js', '.cjs', '.mjs', '.json', '/index.js']
const IMPORT_RE = /(?:require\(\s*|import\s*\(\s*|from\s+)['"](\.{1,2}\/[^'"]+)['"]/g

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // public/ holds browser assets, not server code
    if (entry.name === 'node_modules' || entry.name === 'public') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(c|m)?js$/.test(entry.name)) out.push(full)
  }
  return out
}

// Checks every path segment against the real directory listing.
function existsExactCase(target) {
  const rel = path.relative(ROOT, target)
  if (rel.startsWith('..')) return fs.existsSync(target)
  let current = ROOT
  for (const part of rel.split(path.sep)) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return false
    if (!fs.readdirSync(current).includes(part)) return false
    current = path.join(current, part)
  }
  return true
}

const problems = []
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) continue
  for (const file of walk(abs)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return
      for (const match of line.matchAll(IMPORT_RE)) {
        const base = path.resolve(path.dirname(file), match[1])
        const found = EXTS.some((ext) => {
          const candidate = base + ext
          return existsExactCase(candidate) && fs.statSync(candidate).isFile()
        })
        if (!found) problems.push(`${path.relative(ROOT, file)}:${i + 1}  ${match[1]}`)
      }
    })
  }
}

if (problems.length) {
  console.error('❌ Imports that will fail on Linux (missing file or wrong case):')
  problems.forEach((p) => console.error('   ' + p))
  process.exit(1)
}
console.log('✅ All relative imports match file names exactly')
