import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { zipSync, unzipSync } from 'fflate'

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const build = JSON.parse(readFileSync('dist/browser/build.json', 'utf8'))
const prefix = `cypherx-chat-${build.version}`
const files = {}
function add(name, path) { files[name] = new Uint8Array(readFileSync(path)) }
for (const name of ['widget.min.js', 'widget.mjs', 'widget.d.ts', 'markdown.min.js', 'build.json', 'THIRD-PARTY-NOTICES.txt']) add(name, `dist/browser/${name}`)
add('markdown.css', 'dist/markdown.css')
add('LICENSE', 'LICENSE')
add('README.md', 'BROWSER_SDK.md')
for (const name of readdirSync('browser-examples')) add(`examples/${name}`, `browser-examples/${name}`)
const checksums = Object.entries(files).map(([name, data]) => `${createHash('sha256').update(data).digest('hex')}  ${name}`).join('\n') + '\n'
files['SHA256SUMS'] = new TextEncoder().encode(checksums)
const entries = Object.fromEntries(Object.entries(files).map(([name, data]) => [`${prefix}/${name}`, [data, { mtime: new Date('2020-01-01T00:00:00Z') }]]))
const zip = zipSync(entries, { level: 9 })
// Verify every delivered byte, not just the unarchived build directory.
const unpacked = unzipSync(zip)
for (const [name, data] of Object.entries(files)) {
  if (!Buffer.from(unpacked[`${prefix}/${name}`]).equals(Buffer.from(data))) throw new Error(`ZIP verification failed: ${name}`)
}
mkdirSync('artifacts', { recursive: true })
const path = `artifacts/${prefix}.zip`
writeFileSync(path, zip)
writeFileSync('artifacts/latest-browser.json', JSON.stringify({ path, prefix, version: build.version }, null, 2) + '\n')
console.log(`Verified ZIP: ${path} (${zip.length} bytes)`)
