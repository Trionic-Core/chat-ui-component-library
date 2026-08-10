#!/usr/bin/env node
/* ---------------------------------------------------------------------------
 * AUI wire-contract guard (client SDK side).
 *
 * The agentic-UI `ViewSpec` is a wire contract shared with the CypherX backend
 * (Pydantic models in enterprise/app/chat/aui/models.py). Clients consume THIS
 * package's `src/aui/aui-types.ts`, so the client end of the contract must be
 * CI-enforced here — the backend's own parity test only guards the internal
 * fde-console copy, not this package.
 *
 * This is a textual check (no TS toolchain): it asserts the closed enums, the
 * block discriminants, the nullable scalar, and the load-bearing fields are
 * exactly the canonical set. The canonical set below mirrors the backend
 * models.py — if the wire contract changes, update BOTH (and the backend's
 * test_aui_contract_parity.py). Wired into `prepublishOnly`, so a drifted
 * contract can never be published.
 * ------------------------------------------------------------------------- */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// The types file to check. Defaults to the package's canonical aui-types.ts;
// CHATUI_CONTRACT_TYPES_PATH overrides it so the guard can be exercised against
// a deliberately-mutated copy (see check-aui-contract.test.ts) without
// duplicating the contract logic.
const TYPES_PATH =
  process.env.CHATUI_CONTRACT_TYPES_PATH || resolve(here, '../src/aui/aui-types.ts')
const src = readFileSync(TYPES_PATH, 'utf8')

// ── Canonical contract (mirrors enterprise/app/chat/aui/models.py) ──────────
const CANONICAL = {
  ValueFormat: ['number', 'currency', 'percent', 'compact', 'raw'],
  ChartType: [
    'bar', 'bar_horizontal', 'bar_grouped', 'bar_stacked',
    'line', 'area', 'area_stacked', 'pie', 'donut', 'scatter',
    'box_plot',
  ],
  DeltaDirection: ['up', 'down', 'flat'],
  Align: ['left', 'right', 'center'],
  Orientation: ['vertical', 'horizontal'],
  ActionStyle: ['primary', 'secondary'],
  BlockTypes: ['metric_group', 'chart', 'table', 'text', 'actions'],
}

const errors = []

/** All single-quoted string literals inside a `export type <Name> = ...` union. */
function unionMembers(name) {
  const m = src.match(new RegExp(`export type ${name}\\s*=([\\s\\S]*?)(?:\\n\\n|\\nexport |\\n/\\*)`))
  if (!m) return null
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** The `{ ... }` body of `interface <name>`, or null if it isn't declared. */
function interfaceBody(name) {
  const m = src.match(new RegExp(`interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`))
  return m ? m[1] : null
}

/**
 * Single-quoted literals on a `<field>: 'a' | 'b' | ...` line, scoped to the
 * body of `iface` so a same-named decoy field elsewhere in the file can't
 * false-pass the check.
 */
function inlineUnion(iface, fieldDecl) {
  const body = interfaceBody(iface)
  if (body === null) return null
  const m = body.match(new RegExp(`(?:^|\\n)\\s*${fieldDecl}\\s*:\\s*([^\\n]+)`))
  if (!m) return null
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

function expectSet(label, actual, expected) {
  if (actual === null) {
    errors.push(`${label}: could not be parsed from aui-types.ts`)
    return
  }
  const a = [...actual].sort()
  const e = [...expected].sort()
  if (a.length !== e.length || a.some((v, i) => v !== e[i])) {
    errors.push(`${label}: expected {${e.join(', ')}} but found {${a.join(', ')}}`)
  }
}

// Closed enums
expectSet('ValueFormat', unionMembers('ValueFormat'), CANONICAL.ValueFormat)
expectSet('ChartType', unionMembers('ChartType'), CANONICAL.ChartType)
// Inline unions on their leaf fields — scoped to the owning interface so a
// same-named decoy field elsewhere can't false-pass.
expectSet('MetricDelta.direction', inlineUnion('MetricDelta', 'direction'), CANONICAL.DeltaDirection)
expectSet('TableColumn.align', inlineUnion('TableColumn', 'align\\?'), CANONICAL.Align)
expectSet(
  'ChartBlockOptions.orientation',
  inlineUnion('ChartBlockOptions', 'orientation\\?'),
  CANONICAL.Orientation,
)
expectSet('ActionItem.style', inlineUnion('ActionItem', 'style\\?'), CANONICAL.ActionStyle)

// Block discriminants (the closed catalog) — each block declares `type: '<x>'`.
const blockTypes = [...src.matchAll(/type:\s*'([^']+)'/g)].map((x) => x[1])
expectSet('Block discriminants', blockTypes, CANONICAL.BlockTypes)

// The nullable scalar (the original drift bug: a too-narrow Metric.value).
// Exact-set check: the union must be precisely `string | number | null` — not
// merely "contains null" (which a widened or narrowed union could still pass).
const cellValueMatch = src.match(/export type CellValue\s*=\s*([^\n]+)/)
if (!cellValueMatch) {
  errors.push('CellValue: could not be parsed from aui-types.ts')
} else {
  const members = cellValueMatch[1]
    .replace(/\/\/.*$/, '') // drop a trailing line comment
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  expectSet('CellValue', members, ['string', 'number', 'null'])
}

// Load-bearing required fields that the renderer + backend both rely on.
const REQUIRED_FIELDS = {
  Metric: ['id', 'label', 'value'],
  ChartBlock: ['chart_type', 'data', 'x', 'series'],
  TableBlock: ['columns', 'rows'],
  ViewSpec: ['surface_id', 'version', 'blocks'],
  ActionItem: ['id', 'label', 'on_click'],
}
for (const [iface, fields] of Object.entries(REQUIRED_FIELDS)) {
  const body = interfaceBody(iface)
  if (body === null) { errors.push(`interface ${iface}: not found`); continue }
  for (const f of fields) {
    if (!new RegExp(`(^|\\n)\\s*${f}\\s*:`).test(body)) {
      errors.push(`${iface}.${f}: required field missing`)
    }
  }
}

if (errors.length) {
  console.error('✗ AUI contract check FAILED — client types drifted from the canonical wire contract:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nUpdate src/aui/aui-types.ts to match enterprise/app/chat/aui/models.py')
  console.error('(and the backend test_aui_contract_parity.py).')
  process.exit(1)
}

console.log('✓ AUI contract check passed — client ViewSpec types match the canonical wire contract.')
