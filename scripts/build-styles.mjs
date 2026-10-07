import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const cliRoot = new URL('node_modules/@tailwindcss/cli/', root)
const cli = JSON.parse(readFileSync(new URL('package.json', cliRoot), 'utf8'))

execFileSync(process.execPath, [
  fileURLToPath(new URL(cli.bin.tailwindcss, cliRoot)),
  '-i', 'src/styles/globals.css', '-o', 'dist/styles.css',
], { cwd: fileURLToPath(root), stdio: 'inherit' })

copyFileSync(new URL('src/styles/markdown.css', root), new URL('dist/markdown.css', root))
