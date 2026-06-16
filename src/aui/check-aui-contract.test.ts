import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/* ------------------------------------------------------------------
 * Negative regression for the AUI wire-contract guard.
 *
 * The guard's job is to FAIL when the client ViewSpec types drift from the
 * canonical wire contract. A guard that always passes is worthless, so here we
 * run the real script (via the CHATUI_CONTRACT_TYPES_PATH override) against
 * deliberately-mutated copies of aui-types.ts and assert it exits non-zero —
 * and once against the unmodified file to prove it still passes.
 * ----------------------------------------------------------------*/

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '../..')
const GUARD = join(REPO_ROOT, 'scripts', 'check-aui-contract.mjs')
const CANONICAL_TYPES = join(REPO_ROOT, 'src', 'aui', 'aui-types.ts')

let tmpDir: string
let canonicalSrc: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'aui-contract-'))
  canonicalSrc = readFileSync(CANONICAL_TYPES, 'utf8')
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Run the guard against `source`; returns { ok, output }. */
function runGuard(source: string): { ok: boolean; output: string } {
  const file = join(tmpDir, `types-${Math.random().toString(36).slice(2)}.ts`)
  writeFileSync(file, source)
  try {
    const output = execFileSync('node', [GUARD], {
      env: { ...process.env, CHATUI_CONTRACT_TYPES_PATH: file },
      encoding: 'utf8',
    })
    return { ok: true, output }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

describe('check-aui-contract guard — passes on the real contract', () => {
  it('exits 0 against the unmodified aui-types.ts', () => {
    const { ok } = runGuard(canonicalSrc)
    expect(ok).toBe(true)
  })
})

describe('check-aui-contract guard — fails on drift', () => {
  it('fails when CellValue drops null', () => {
    const drifted = canonicalSrc.replace(
      /export type CellValue\s*=\s*string \| number \| null/,
      'export type CellValue = string | number',
    )
    expect(drifted).not.toBe(canonicalSrc)
    const { ok, output } = runGuard(drifted)
    expect(ok).toBe(false)
    expect(output).toContain('CellValue')
  })

  it('fails when CellValue is widened beyond the canonical set', () => {
    const drifted = canonicalSrc.replace(
      /export type CellValue\s*=\s*string \| number \| null/,
      'export type CellValue = string | number | null | boolean',
    )
    expect(drifted).not.toBe(canonicalSrc)
    const { ok } = runGuard(drifted)
    expect(ok).toBe(false)
  })

  it('fails when a ChartType member is removed', () => {
    const drifted = canonicalSrc.replace(/\s*\|\s*'scatter'/, '')
    expect(drifted).not.toBe(canonicalSrc)
    const { ok, output } = runGuard(drifted)
    expect(ok).toBe(false)
    expect(output).toContain('ChartType')
  })

  it('fails when a required ViewSpec field is removed', () => {
    const drifted = canonicalSrc.replace(/\n\s*surface_id:\s*string/, '')
    expect(drifted).not.toBe(canonicalSrc)
    const { ok, output } = runGuard(drifted)
    expect(ok).toBe(false)
    expect(output).toContain('surface_id')
  })

  it('fails when an inline union (TableColumn.align) drifts', () => {
    const drifted = canonicalSrc.replace(
      /align\?:\s*'left' \| 'right' \| 'center'/,
      "align?: 'left' | 'right'",
    )
    expect(drifted).not.toBe(canonicalSrc)
    const { ok, output } = runGuard(drifted)
    expect(ok).toBe(false)
    expect(output).toContain('TableColumn.align')
  })
})
