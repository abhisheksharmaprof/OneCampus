/** Safe spreadsheet-style formula engine.
 *
 *  Syntax (reference-compatible): `=[Qty]*[Rate]`, `=IF([Marks]>=91,"A1","A2")`,
 *  `=SUM_TABLE("Amount")`, `=RANK([Marks])`, row refs `[Row label]` in totals.
 *  Implementation: tokenizer → recursive-descent parser → AST evaluation with an
 *  explicit environment. Stored template content is NEVER executed as code.
 */

import type { TableColumn, TotalsRow } from './types'

export type Value = number | string | boolean
export class FormulaError extends Error {}

export interface FormulaEnv {
  /** Resolve `[Name]` for the current scope. Throw for unknown names. */
  ref(name: string): Value
  /** All numeric values of a column (for RANK/PERCENTILE). */
  columnValues?(label: string): number[]
  /** Sum of a computed table column (for SUM_TABLE). */
  sumTable?(label: string): number
}

type Token =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string }
  | { t: 'ident'; v: string } | { t: 'op'; v: string } | { t: 'lparen' } | { t: 'rparen' } | { t: 'comma' }

const FUNCTIONS = new Set(['IF', 'SUM', 'AVG', 'MAX', 'MIN', 'ROUND', 'RANK', 'PERCENTILE', 'SUM_TABLE'])

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === ' ' || ch === '\t') { i += 1; continue }
    if (ch === '(') { tokens.push({ t: 'lparen' }); i += 1; continue }
    if (ch === ')') { tokens.push({ t: 'rparen' }); i += 1; continue }
    if (ch === ',') { tokens.push({ t: 'comma' }); i += 1; continue }
    if (ch === '[') {
      const end = source.indexOf(']', i)
      if (end === -1) throw new FormulaError('Unclosed [reference]')
      tokens.push({ t: 'ref', v: source.slice(i + 1, end).trim() })
      i = end + 1
      continue
    }
    if (ch === '"') {
      const end = source.indexOf('"', i + 1)
      if (end === -1) throw new FormulaError('Unclosed string')
      tokens.push({ t: 'str', v: source.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(i))
      if (!match) throw new FormulaError(`Bad number at ${i}`)
      tokens.push({ t: 'num', v: Number(match[0]) })
      i += match[0].length
      continue
    }
    const twoChar = source.slice(i, i + 2)
    if (['>=', '<=', '==', '!='].includes(twoChar)) { tokens.push({ t: 'op', v: twoChar }); i += 2; continue }
    if ('+-*/><'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i += 1; continue }
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!
      tokens.push({ t: 'ident', v: match[0] })
      i += match[0].length
      continue
    }
    throw new FormulaError(`Unexpected character '${ch}'`)
  }
  return tokens
}

type Node =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'ref'; name: string }
  | { k: 'call'; name: string; args: Node[] } | { k: 'bin'; op: string; l: Node; r: Node } | { k: 'neg'; e: Node }

function parse(tokens: Token[]): Node {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expect = (t: Token['t']) => {
    const token = next()
    if (!token || token.t !== t) throw new FormulaError(`Expected ${t}`)
    return token
  }

  function comparison(): Node {
    let left = additive()
    const token = peek()
    if (token?.t === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(token.v)) {
      next()
      left = { k: 'bin', op: token.v, l: left, r: additive() }
    }
    return left
  }
  function additive(): Node {
    let left = multiplicative()
    while (peek()?.t === 'op' && ['+', '-'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      left = { k: 'bin', op, l: left, r: multiplicative() }
    }
    return left
  }
  function multiplicative(): Node {
    let left = unary()
    while (peek()?.t === 'op' && ['*', '/'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      left = { k: 'bin', op, l: left, r: unary() }
    }
    return left
  }
  function unary(): Node {
    const token = peek()
    if (token?.t === 'op' && token.v === '-') { next(); return { k: 'neg', e: unary() } }
    return primary()
  }
  function primary(): Node {
    const token = next()
    if (!token) throw new FormulaError('Unexpected end of formula')
    if (token.t === 'num') return { k: 'num', v: token.v }
    if (token.t === 'str') return { k: 'str', v: token.v }
    if (token.t === 'ref') return { k: 'ref', name: token.v }
    if (token.t === 'lparen') {
      const inner = comparison()
      expect('rparen')
      return inner
    }
    if (token.t === 'ident') {
      if (!FUNCTIONS.has(token.v)) throw new FormulaError(`Unknown function '${token.v}'`)
      expect('lparen')
      const args: Node[] = []
      if (peek()?.t !== 'rparen') {
        args.push(comparison())
        while (peek()?.t === 'comma') { next(); args.push(comparison()) }
      }
      expect('rparen')
      return { k: 'call', name: token.v, args }
    }
    throw new FormulaError('Unexpected token')
  }

  const root = comparison()
  if (pos !== tokens.length) throw new FormulaError('Trailing input after expression')
  return root
}

// Intentional coercion asymmetry: '' coerces to 0 via Number(''), matching spreadsheet-style
// leniency for blank cells; null/undefined are never passed here — they are rejected earlier,
// at ref resolution (computeTableRows/computeTotals), so a missing value fails as '#ERR' there.
function asNumber(value: Value): number {
  if (typeof value === 'boolean') return value ? 1 : 0
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) throw new FormulaError(`Not a number: ${String(value)}`)
  return num
}

function evalNode(node: Node, env: FormulaEnv): Value {
  switch (node.k) {
    case 'num': return node.v
    case 'str': return node.v
    case 'ref': return env.ref(node.name)
    case 'neg': return -asNumber(evalNode(node.e, env))
    case 'bin': {
      const l = evalNode(node.l, env)
      const r = evalNode(node.r, env)
      switch (node.op) {
        case '+': return asNumber(l) + asNumber(r)
        case '-': return asNumber(l) - asNumber(r)
        case '*': return asNumber(l) * asNumber(r)
        case '/': {
          const denom = asNumber(r)
          const numer = asNumber(l)
          if (denom === 0) throw new FormulaError('Division by zero')
          const result = numer / denom
          if (!Number.isFinite(result)) throw new FormulaError('Division produced a non-finite result')
          return result
        }
        case '>': return asNumber(l) > asNumber(r)
        case '>=': return asNumber(l) >= asNumber(r)
        case '<': return asNumber(l) < asNumber(r)
        case '<=': return asNumber(l) <= asNumber(r)
        case '==': {
          if (l === r) return true
          const ln = asNumberSafe(l)
          return ln !== null && ln === asNumberSafe(r)
        }
        case '!=': {
          if (l === r) return false
          const ln = asNumberSafe(l)
          return !(ln !== null && ln === asNumberSafe(r))
        }
        default: throw new FormulaError(`Unknown operator ${node.op}`)
      }
    }
    case 'call': {
      const { name, args } = node
      if (name === 'IF') {
        if (args.length !== 3) throw new FormulaError('IF takes 3 arguments')
        return evalNode(args[0], env) ? evalNode(args[1], env) : evalNode(args[2], env)
      }
      if (name === 'RANK' || name === 'PERCENTILE') {
        const refArg = args[0]
        if (args.length !== 1 || refArg.k !== 'ref') throw new FormulaError(`${name} takes one [Column] reference`)
        if (!env.columnValues) throw new FormulaError(`${name} needs table context`)
        const values = env.columnValues(refArg.name)
        const mine = asNumber(env.ref(refArg.name))
        if (name === 'RANK') {
          const sorted = [...new Set(values)].sort((a, b) => b - a)
          return sorted.indexOf(mine) + 1
        }
        const below = values.filter((value) => value <= mine).length
        return Math.round((below / values.length) * 100)
      }
      if (name === 'SUM_TABLE') {
        const labelArg = args[0]
        if (args.length !== 1 || labelArg.k !== 'str') throw new FormulaError('SUM_TABLE takes one "Column label"')
        if (!env.sumTable) throw new FormulaError('SUM_TABLE needs table context')
        return env.sumTable(labelArg.v)
      }
      const values = args.map((arg) => asNumber(evalNode(arg, env)))
      switch (name) {
        case 'SUM': return values.reduce((sum, value) => sum + value, 0)
        case 'AVG': return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
        case 'MAX':
        case 'MIN':
          if (!values.length) throw new FormulaError(`${name} needs at least one argument`)
          return name === 'MAX' ? Math.max(...values) : Math.min(...values)
        case 'ROUND': {
          const digits = Math.min(Math.max(Math.trunc(values[1] ?? 0), 0), 100)
          return Number(values[0].toFixed(digits))
        }
        default: throw new FormulaError(`Unknown function '${name}'`)
      }
    }
  }
}

function asNumberSafe(value: Value): number | null {
  try { return asNumber(value) } catch { return null }
}

/** Tokenize + parse a formula once, so repeated evaluation (e.g. one per table row)
 *  doesn't re-tokenize/re-parse for every call. Throws FormulaError on bad syntax. */
function compileFormula(source: string): Node {
  const stripped = source.trim().replace(/^=/, '')
  if (!stripped) throw new FormulaError('Empty formula')
  return parse(tokenize(stripped))
}

/** Evaluate an already-compiled AST, applying the same non-finite-result guard as
 *  `evaluateFormula` (so MAX()/MIN() misuse or arithmetic overflow can never leak
 *  Infinity/-Infinity/NaN out of the engine). */
function evalCompiled(node: Node, env: FormulaEnv): Value {
  const result = evalNode(node, env)
  if (typeof result === 'number' && !Number.isFinite(result)) {
    throw new FormulaError('Formula produced a non-finite number')
  }
  return result
}

export function evaluateFormula(source: string, env: FormulaEnv): Value {
  return evalCompiled(compileFormula(source), env)
}

/** Compute formula columns for every row. Errors become '#ERR' in that cell only.
 *
 *  `column.formula` is optional on `TableColumn` (data columns never set it) — a
 *  formula column with a missing/empty formula evaluates to '#ERR' via
 *  `evaluateFormula`'s empty-formula check, rather than throwing out of this loop.
 */
export function computeTableRows(
  columns: TableColumn[],
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const byLabel = new Map(columns.map((column) => [column.label, column]))
  const computed = rows.map((row) => ({ ...row }))
  for (const column of columns) {
    if (column.type !== 'formula') continue

    let compiled: Node
    try {
      compiled = compileFormula(column.formula ?? '')
    } catch {
      // Compile failure applies to every row in this column — set once, skip the row loop.
      for (const row of computed) row[column.id] = '#ERR'
      continue
    }

    // Memoized per-column-pass snapshot: built lazily (only if the formula actually
    // calls columnValues), once, from the table's state at the start of this pass —
    // not rebuilt per row/per cell.
    const columnValuesCache = new Map<string, number[]>()
    const getColumnValues = (label: string): number[] => {
      const cached = columnValuesCache.get(label)
      if (cached) return cached
      const target = byLabel.get(label)
      if (!target) throw new FormulaError(`Unknown column [${label}]`)
      const values = computed.map((r) => Number(r[target.id]) || 0)
      columnValuesCache.set(label, values)
      return values
    }

    for (const row of computed) {
      const env: FormulaEnv = {
        ref(name) {
          const target = byLabel.get(name)
          if (!target) throw new FormulaError(`Unknown column [${name}]`)
          const value = row[target.id]
          if (value === undefined || value === null || value === '#ERR') throw new FormulaError(`No value for [${name}]`)
          return value as Value
        },
        columnValues: getColumnValues,
      }
      try {
        row[column.id] = evalCompiled(compiled, env)
      } catch {
        row[column.id] = '#ERR'
      }
    }
  }
  return computed
}

/** Evaluate totals rows top-to-bottom. Errors and forward references become '#ERR'.
 *
 *  `TotalsRow.formula` and `TotalsRow.value` are both optional (kind-dependent) —
 *  a 'formula' row with a missing formula evaluates to '#ERR' (same empty-formula
 *  path as `computeTableRows`); a 'value' row with a missing value coerces via
 *  `Number(row.value) || 0` to 0.
 */
export function computeTotals(
  rows: TotalsRow[],
  table: { columns: TableColumn[]; rows: Record<string, unknown>[] } | null,
): Record<string, number | string> {
  const results: Record<string, number | string> = {}
  const computedTable = table ? computeTableRows(table.columns, table.rows) : null
  for (const row of rows) {
    if (row.kind === 'value') {
      results[row.id] = Number(row.value) || 0
      continue
    }
    const env: FormulaEnv = {
      ref(name) {
        const earlier = rows.find((candidate) => candidate.label === name)
        if (!earlier || !(earlier.id in results)) throw new FormulaError(`Unknown row [${name}]`)
        const value = results[earlier.id]
        if (value === '#ERR') throw new FormulaError('Referenced row errored')
        return value
      },
      sumTable(label) {
        if (!computedTable || !table) throw new FormulaError('No table on this template')
        const column = table.columns.find((candidate) => candidate.label === label)
        if (!column) throw new FormulaError(`Unknown table column "${label}"`)
        return computedTable.reduce((sum, entry) => sum + (Number(entry[column.id]) || 0), 0)
      },
    }
    try {
      const compiled = compileFormula(row.formula ?? '')
      const value = evalCompiled(compiled, env)
      results[row.id] = typeof value === 'boolean' ? Number(value) : value as number | string
    } catch {
      results[row.id] = '#ERR'
    }
  }
  return results
}
