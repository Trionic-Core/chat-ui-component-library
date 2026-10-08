import { build } from 'esbuild'
import { build as buildTypes } from 'tsup'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parse } from 'postcss'
import selectorParser from 'postcss-selector-parser'
import valueParser from 'postcss-value-parser'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const revision = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim()
const version = `${pkg.version}-browser.${revision}`
mkdirSync('dist/browser', { recursive: true })

// Tailwind theme/preflight and library tokens must live inside this shadow tree.
const css = parse(readFileSync('dist/styles.css', 'utf8'))
css.walkRules(rule => {
  rule.selector = selectorParser(selectors => {
    selectors.walk(node => {
      if ((node.type === 'pseudo' && [':root', ':host'].includes(node.value)) || (node.type === 'tag' && node.value === 'html')) {
        node.replaceWith(selectorParser.className({ value: 'cxc-browser-root' }))
      }
    })
  }).processSync(rule.selector)
})
// Host html {font-size:62.5%} must not shrink every control or table column.
css.walkDecls(declaration => {
  declaration.value = valueParser(declaration.value).walk(node => {
    if (node.type !== 'word') return
    const unit = valueParser.unit(node.value)
    if (unit?.unit === 'rem') node.value = `calc(var(--cxc-browser-rem, 16px) * ${unit.number})`
  }).toString()
})
writeFileSync('dist/browser/widget.css', css.toString() + '\n' + readFileSync('src/browser/frame.css', 'utf8'))

const shared = {
  entryPoints: ['src/browser/index.tsx'], bundle: true, minify: true,
  platform: 'browser', target: ['es2020'], jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', __CXC_BROWSER_VERSION__: JSON.stringify(version) },
  loader: { '.css': 'text' }, legalComments: 'eof', metafile: true,
}
const result = await build({ ...shared, format: 'iife', globalName: 'CypherXChat', outfile: 'dist/browser/widget.min.js' })
await build({ ...shared, format: 'esm', outfile: 'dist/browser/widget.mjs' })
await build({ ...shared, entryPoints: ['src/utils/markdown.ts'], format: 'iife', globalName: 'CypherXMarkdown', outfile: 'dist/browser/markdown.min.js' })
await buildTypes({ entry: { widget: 'src/browser/index.tsx' }, format: ['esm'], outDir: 'dist/browser', clean: false, dts: { only: true } })

// Preserve licenses for all third-party modules actually included in the bundle.
const packages = new Map()
for (const input of Object.keys(result.metafile.inputs).filter(path => path.includes('node_modules/'))) {
  let directory = dirname(resolve(input))
  while (directory !== root && directory !== dirname(directory)) {
    try {
      const dep = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
      if (dep.name) { packages.set(directory, dep); break }
    } catch { /* Continue to the owning package. */ }
    directory = dirname(directory)
  }
}
const notices = []
for (const [directory, dep] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
  let license
  // victory-vendor's npm tarball omits its root license, but includes the
  // vendored D3 licenses. Root text is from upstream tag v37.3.6/LICENSE.txt.
  if (dep.name === 'victory-vendor') {
    if (dep.version !== '37.3.6') throw new Error('Review the victory-vendor license for this version')
    license = readFileSync('scripts/licenses/victory-vendor.txt', 'utf8')
    for (const vendor of readdirSync(resolve(directory, 'lib-vendor'))) {
      license += `\n\n${vendor}\n` + readFileSync(resolve(directory, 'lib-vendor', vendor, 'LICENSE'), 'utf8')
    }
  }
  for (const name of readdirSync(directory).filter(name => /^licen[cs]e(?:[-.].*)?$/i.test(name))) {
    try { license = readFileSync(resolve(directory, name), 'utf8'); break } catch { /* Try conventional names. */ }
  }
  if (!license) throw new Error(`Missing redistribution license: ${dep.name}`)
  notices.push(`${dep.name}@${dep.version}\n${license}`)
}
writeFileSync('dist/browser/THIRD-PARTY-NOTICES.txt', notices.join('\n\n---\n\n'))
writeFileSync('dist/browser/build.json', JSON.stringify({ version, componentVersion: pkg.version, revision,
  bundledDependencies: [...packages.values()].map(({ name, version, license }) => ({ name, version, license })).sort((a, b) => a.name.localeCompare(b.name)),
}, null, 2) + '\n')
console.log(`Browser SDK ${version}: self-contained IIFE and ES module built`)
