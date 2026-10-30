export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

export type TokenType = 'NUM' | 'STR' | 'IDENT' | 'FUNC' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA'

export interface Token {
  type: TokenType
  value: string
  numValue?: number
}

const SUPPORTED_FUNCTIONS = new Set(['SUM', 'COUNT', 'AVERAGE', 'AVG', 'MIN', 'MAX', 'ROUND'])

export function tokenizeFormula(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const clean = source.trim().replace(/^=/, '')

  while (i < clean.length) {
    const ch = clean[i]
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',' })
      i++
      continue
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch })
      i++
      continue
    }

    // Quoted strings
    if (ch === '"' || ch === "'") {
      const quote = ch
      const end = clean.indexOf(quote, i + 1)
      if (end === -1) throw new FormulaError('Unclosed string literal in formula')
      tokens.push({ type: 'STR', value: clean.slice(i + 1, end) })
      i = end + 1
      continue
    }

    // Bracketed reference: [Column Name]
    if (ch === '[') {
      const end = clean.indexOf(']', i)
      if (end === -1) throw new FormulaError('Unclosed bracket [field] reference')
      tokens.push({ type: 'IDENT', value: clean.slice(i + 1, end).trim() })
      i = end + 1
      continue
    }

    // Numeric literals
    if (/[0-9.]/.test(ch)) {
      const match = /^[0-9]*\.?[0-9]+/.exec(clean.slice(i))
      if (!match) throw new FormulaError(`Invalid numeric character at index ${i}`)
      const val = Number(match[0])
      tokens.push({ type: 'NUM', value: match[0], numValue: val })
      i += match[0].length
      continue
    }

    // Identifiers or Function names
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(clean.slice(i))
      if (!match) throw new FormulaError(`Invalid identifier at index ${i}`)
      const word = match[0]
      const upper = word.toUpperCase()
      if (SUPPORTED_FUNCTIONS.has(upper)) {
        tokens.push({ type: 'FUNC', value: upper })
      } else {
        tokens.push({ type: 'IDENT', value: word })
      }
      i += word.length
      continue
    }

    throw new FormulaError(`Unexpected character '${ch}' in formula`)
  }

  return tokens
}

export type AstNode =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'field'; fieldName: string }
  | { kind: 'binary'; op: string; left: AstNode; right: AstNode }
  | { kind: 'unary'; op: '-'; expr: AstNode }
  | { kind: 'call'; func: string; arg?: string }

export function parseFormula(tokens: Token[]): AstNode {
  let pos = 0
  let depth = 0
  const MAX_DEPTH = 20

  function peek(): Token | undefined {
    return tokens[pos]
  }
  function next(): Token {
    return tokens[pos++]
  }
  function expect(type: TokenType): Token {
    const t = next()
    if (!t || t.type !== type) throw new FormulaError(`Expected token ${type}`)
    return t
  }

  function additive(): AstNode {
    let left = multiplicative()
    while (peek()?.type === 'OP' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = next().value
      left = { kind: 'binary', op, left, right: multiplicative() }
    }
    return left
  }

  function multiplicative(): AstNode {
    let left = unary()
    while (peek()?.type === 'OP' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = next().value
      left = { kind: 'binary', op, left, right: unary() }
    }
    return left
  }

  function unary(): AstNode {
    if (peek()?.type === 'OP' && peek()!.value === '-') {
      next()
      return { kind: 'unary', op: '-', expr: unary() }
    }
    return primary()
  }

  function primary(): AstNode {
    depth++
    if (depth > MAX_DEPTH) throw new FormulaError('Formula exceeds maximum nesting depth')
    try {
      const t = next()
      if (!t) throw new FormulaError('Unexpected end of formula')

      if (t.type === 'NUM') return { kind: 'number', value: t.numValue ?? Number(t.value) }
      if (t.type === 'STR') return { kind: 'string', value: t.value }
      if (t.type === 'IDENT') return { kind: 'field', fieldName: t.value }

      if (t.type === 'LPAREN') {
        const inner = additive()
        expect('RPAREN')
        return inner
      }

      if (t.type === 'FUNC') {
        expect('LPAREN')
        let argField: string | undefined
        if (peek()?.type !== 'RPAREN') {
          const argTok = next()
          if (argTok.type === 'IDENT' || argTok.type === 'STR') {
            argField = argTok.value
          } else {
            throw new FormulaError(`Function ${t.value} requires a field name`)
          }
        }
        expect('RPAREN')
        return { kind: 'call', func: t.value, arg: argField }
      }

      throw new FormulaError(`Unexpected token '${t.value}'`)
    } finally {
      depth--
    }
  }

  const root = additive()
  if (pos !== tokens.length) throw new FormulaError('Trailing tokens after valid formula')
  return root
}

export function extractNumericValue(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[₹$,]/g, '').trim()
    if (!cleaned) return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function evaluateAggregateNode(
  node: AstNode,
  dataset: Array<Record<string, unknown>>,
): number | string {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'string':
      return node.value
    case 'field':
      return 0
    case 'unary': {
      const val = evaluateAggregateNode(node.expr, dataset)
      return -Number(val)
    }
    case 'binary': {
      const l = Number(evaluateAggregateNode(node.left, dataset))
      const r = Number(evaluateAggregateNode(node.right, dataset))
      if (node.op === '+') return l + r
      if (node.op === '-') return l - r
      if (node.op === '*') return l * r
      if (node.op === '/') return r === 0 ? 0 : l / r
      return 0
    }
    case 'call': {
      const field = node.arg?.replace(/^item\./, '')
      const numbers: number[] = []

      for (const row of dataset) {
        if (!field) continue
        const raw = row[field] ?? row[node.arg!]
        const num = extractNumericValue(raw)
        if (num !== null) numbers.push(num)
      }

      switch (node.func) {
        case 'SUM':
          return numbers.reduce((acc, curr) => acc + curr, 0)
        case 'COUNT':
          if (!field) return dataset.length
          return dataset.filter((r) => {
            const v = r[field] ?? r[node.arg!]
            return v !== null && v !== undefined && v !== ''
          }).length
        case 'AVERAGE':
        case 'AVG':
          if (numbers.length === 0) return 0
          return numbers.reduce((acc, curr) => acc + curr, 0) / numbers.length
        case 'MIN':
          return numbers.length ? Math.min(...numbers) : 0
        case 'MAX':
          return numbers.length ? Math.max(...numbers) : 0
        case 'ROUND':
          return numbers.length ? Math.round(numbers[0]) : 0
        default:
          return 0
      }
    }
  }
}

/** Evaluates aggregate formula over a dataset, returning numeric total or #ERR */
export function evaluateTotalsFormula(
  formula: string,
  dataset: Array<Record<string, unknown>>,
): number | string {
  try {
    const tokens = tokenizeFormula(formula)
    const ast = parseFormula(tokens)
    const result = evaluateAggregateNode(ast, dataset)
    if (typeof result === 'number' && Number.isNaN(result)) return '#ERR'
    return result
  } catch {
    return '#ERR'
  }
}
