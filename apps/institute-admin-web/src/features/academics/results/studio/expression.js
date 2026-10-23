// Arithmetic only: workbook text is never executable JavaScript.
export function evaluateExpression(source, values) {
  if (typeof source !== 'string' || !source.trim() || source.length > 240)
    throw Error('Use a formula of 1–240 characters.')
  const parts = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Z_]+|[()+*/,\-]|\S/gi) || []
  if (parts.length > 100) throw Error('Formula is too complex.')
  let index = 0
  const checked = (value) => {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw Error('Invalid arithmetic.')
    return value
  }
  function atom() {
    const token = parts[index++]
    if (token === '+' || token === '-') return checked((token === '-' ? -1 : 1) * atom())
    if (token === '(') {
      const value = sum()
      if (parts[index++] !== ')') throw Error('Missing closing parenthesis.')
      return value
    }
    if (token === 'ROUND') {
      if (parts[index++] !== '(') throw Error('ROUND requires parentheses.')
      const value = sum()
      let precision = 2
      if (parts[index] === ',') {
        index++
        precision = sum()
      }
      if (parts[index++] !== ')' || !Number.isInteger(precision) || precision < 0 || precision > 4)
        throw Error('ROUND precision must be 0–4.')
      return checked(Number(value.toFixed(precision)))
    }
    if (['SUM', 'MAX_SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'CGPA', 'CREDITS'].includes(token))
      return checked(Number(values[token]))
    if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token || '')) return checked(Number(token))
    throw Error('Use arithmetic, supported variables, parentheses and ROUND only.')
  }
  function product() {
    let value = atom()
    while (parts[index] === '*' || parts[index] === '/') {
      const op = parts[index++]
      const right = atom()
      value = checked(op === '*' ? value * right : value / right)
    }
    return value
  }
  function sum() {
    let value = product()
    while (parts[index] === '+' || parts[index] === '-') {
      const op = parts[index++]
      const right = product()
      value = checked(op === '+' ? value + right : value - right)
    }
    return value
  }
  const result = sum()
  if (index !== parts.length) throw Error('Unexpected formula token.')
  return result
}
