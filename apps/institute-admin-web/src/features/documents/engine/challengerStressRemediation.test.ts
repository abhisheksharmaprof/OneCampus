import { describe, expect, it } from 'vitest'
import {
  generateBarcodeSvg,
  interpolateTokens,
  isTruthy,
  resolvePathValue,
} from '@campusone/document-engine'

describe('Empirical Adversarial Verification - Milestone 2 Remediation', () => {
  describe('1. Barcode SVG Generator Security & XML Validity', () => {
    const maliciousPayloads = [
      'DPS & SONS',
      'STU-101<script>alert(1)</script>',
      '"></text><script>window.__xss=1</script><text>',
      'DPS & SONS / 2026 <>&"\'',
      '"><img src=x onerror=alert(1)>',
      '<![CDATA[<script>alert("cdata")</script>]]>',
      '{{student.name}} & <script>',
      'A & B & C & D & E',
      'quotes "double" and \'single\'',
      '<svg><g onload="alert(1)"></g></svg>',
    ]

    maliciousPayloads.forEach((payload) => {
      it(`[CODE128] parses cleanly with 0 XML errors and 0 unescaped script tags for payload: "${payload}"`, () => {
        const svg = generateBarcodeSvg(payload, {
          format: 'CODE128',
          showText: true,
          color: '#111111',
          backgroundColor: '#ffffff',
        })

        // 1. Raw SVG must not contain unescaped raw '<script>' tags
        expect(svg).not.toMatch(/<script\b[^>]*>/i)

        // 2. Parse through DOMParser (image/svg+xml)
        const parser = new DOMParser()
        const doc = parser.parseFromString(svg, 'image/svg+xml')

        // 3. Prove 0 XML parse errors
        const parseError = doc.querySelector('parsererror')
        expect(parseError).toBeNull()

        // 4. Prove no script elements exist in parsed DOM
        const scripts = doc.querySelectorAll('script')
        expect(scripts.length).toBe(0)

        // 5. Prove text content accurately preserves the raw payload string
        const textElement = doc.querySelector('text')
        expect(textElement).not.toBeNull()
        expect(textElement?.textContent).toBe(payload)
      })

      it(`[CODE39] parses cleanly with 0 XML errors and 0 unescaped script tags for payload: "${payload}"`, () => {
        const svg = generateBarcodeSvg(payload, {
          format: 'CODE39',
          showText: true,
          color: '#222222',
          backgroundColor: '#eeeeee',
        })

        expect(svg).not.toMatch(/<script\b[^>]*>/i)

        const parser = new DOMParser()
        const doc = parser.parseFromString(svg, 'image/svg+xml')

        const parseError = doc.querySelector('parsererror')
        expect(parseError).toBeNull()

        const scripts = doc.querySelectorAll('script')
        expect(scripts.length).toBe(0)

        const textElement = doc.querySelector('text')
        expect(textElement).not.toBeNull()
        expect(textElement?.textContent).toBe(payload)
      })
    })

    it('neutralizes attribute injection attempts in color and backgroundColor', () => {
      const maliciousColors = [
        '#000000" onmouseover="alert(1)',
        'blue"><script>alert(2)</script>',
        'transparent" onload="stealCookies()',
        'red\' onfocus=\'alert(3)',
      ]

      maliciousColors.forEach((badColor) => {
        const svg = generateBarcodeSvg('SAFE-VALUE-123', {
          color: badColor,
          backgroundColor: badColor,
        })

        expect(svg).not.toMatch(/<script\b[^>]*>/i)

        const parser = new DOMParser()
        const doc = parser.parseFromString(svg, 'image/svg+xml')
        expect(doc.querySelector('parsererror')).toBeNull()
        expect(doc.querySelectorAll('script').length).toBe(0)
      })
    })

    it('generates valid XML when showText is false and textPosition is top', () => {
      const svgTop = generateBarcodeSvg('STU-TOP', {
        showText: true,
        textPosition: 'top',
      })
      const parser = new DOMParser()
      const docTop = parser.parseFromString(svgTop, 'image/svg+xml')
      expect(docTop.querySelector('parsererror')).toBeNull()
      expect(docTop.querySelector('text')?.getAttribute('y')).toBe('14')

      const svgNoText = generateBarcodeSvg('STU-NOTEXT', {
        showText: false,
      })
      const docNoText = parser.parseFromString(svgNoText, 'image/svg+xml')
      expect(docNoText.querySelector('parsererror')).toBeNull()
      expect(docNoText.querySelector('text')).toBeNull()
    })
  })

  describe('2. Token Interpolation Engine - Conditionals & Truthiness Stress', () => {
    describe('2.1 Zero Value (0) Truthiness and Rendering', () => {
      it('evaluates number 0 as truthy in isTruthy()', () => {
        expect(isTruthy(0)).toBe(true)
        expect(isTruthy(-0)).toBe(true)
        expect(isTruthy(0.0)).toBe(true)
        expect(isTruthy(-1)).toBe(true)
        expect(isTruthy(100)).toBe(true)
      })

      it('evaluates falsy values properly in isTruthy()', () => {
        expect(isTruthy(null)).toBe(false)
        expect(isTruthy(undefined)).toBe(false)
        expect(isTruthy(false)).toBe(false)
        expect(isTruthy('')).toBe(false)
        expect(isTruthy('   ')).toBe(false)
        expect(isTruthy([])).toBe(false)
      })

      it('executes #if truthy branch when value is 0', () => {
        const data = {
          student: {
            roll_no: 0,
            marks: 0,
            backlog_count: 0,
          },
        }

        const tplRoll = '{{#if student.roll_no}}Roll: {{student.roll_no}}{{else}}No Roll{{/if}}'
        expect(interpolateTokens(tplRoll, data)).toBe('Roll: 0')

        const tplMarks = '{{#if student.marks}}Marks: {{student.marks}}{{else}}Absent{{/if}}'
        expect(interpolateTokens(tplMarks, data)).toBe('Marks: 0')

        const tplBacklog = '{{#if student.backlog_count}}Has {{student.backlog_count}} Backlogs{{else}}Clear{{/if}}'
        expect(interpolateTokens(tplBacklog, data)).toBe('Has 0 Backlogs')
      })

      it('renders 0 in variable tokens without triggering fallback', () => {
        const data = {
          exam: {
            rank: 0,
            score: 0,
          },
        }

        const tpl = 'Rank: {{exam.rank | "Unranked"}}, Score: {{exam.score | "Zero"}}'
        expect(interpolateTokens(tpl, data)).toBe('Rank: 0, Score: 0')
      })
    })

    describe('2.2 Deeply Nested Conditionals (3+ Levels)', () => {
      it('evaluates all 8 truth-table states for 3-level nested conditionals', () => {
        const tpl = '{{#if l1}}1 [{{#if l2}}2 [{{#if l3}}3{{else}}!3{{/if}}]{{else}}!2{{/if}}]{{else}}!1{{/if}}'

        const expectations = [
          { data: { l1: true, l2: true, l3: true }, expected: '1 [2 [3]]' },
          { data: { l1: true, l2: true, l3: false }, expected: '1 [2 [!3]]' },
          { data: { l1: true, l2: false, l3: true }, expected: '1 [!2]' },
          { data: { l1: true, l2: false, l3: false }, expected: '1 [!2]' },
          { data: { l1: false, l2: true, l3: true }, expected: '!1' },
          { data: { l1: false, l2: true, l3: false }, expected: '!1' },
          { data: { l1: false, l2: false, l3: true }, expected: '!1' },
          { data: { l1: false, l2: false, l3: false }, expected: '!1' },
        ]

        for (const { data, expected } of expectations) {
          expect(interpolateTokens(tpl, data)).toBe(expected)
        }
      })

      it('evaluates 4-level nested conditionals across all combinations', () => {
        const tpl = '{{#if a}}A({{#if b}}B({{#if c}}C({{#if d}}D{{else}}!D{{/if}}){{else}}!C{{/if}}){{else}}!B{{/if}}){{else}}!A{{/if}}'

        expect(interpolateTokens(tpl, { a: true, b: true, c: true, d: true })).toBe('A(B(C(D)))')
        expect(interpolateTokens(tpl, { a: true, b: true, c: true, d: false })).toBe('A(B(C(!D)))')
        expect(interpolateTokens(tpl, { a: true, b: true, c: false, d: true })).toBe('A(B(!C))')
        expect(interpolateTokens(tpl, { a: true, b: false, c: true, d: true })).toBe('A(!B)')
        expect(interpolateTokens(tpl, { a: false, b: true, c: true, d: true })).toBe('!A')
      })

      it('evaluates 5-level nested conditionals correctly', () => {
        const tpl = '{{#if a}}{{#if b}}{{#if c}}{{#if d}}{{#if e}}LEVEL_5_REACHED{{/if}}{{/if}}{{/if}}{{/if}}{{/if}}'

        expect(interpolateTokens(tpl, { a: true, b: true, c: true, d: true, e: true })).toBe('LEVEL_5_REACHED')
        expect(interpolateTokens(tpl, { a: true, b: true, c: true, d: true, e: false })).toBe('')
        expect(interpolateTokens(tpl, { a: true, b: true, c: false, d: true, e: true })).toBe('')
      })
    })

    describe('2.3 Sibling Conditionals & Complex Sequences', () => {
      it('evaluates multiple sequential sibling conditionals containing nested blocks', () => {
        const tpl = [
          'Prefix: ',
          '{{#if s1}}{{#if s1_sub}}S1-SUB{{else}}S1-DEFAULT{{/if}}{{else}}NO-S1{{/if}}',
          ' | ',
          '{{#if s2}}{{#if s2_sub}}S2-SUB{{else}}S2-DEFAULT{{/if}}{{else}}NO-S2{{/if}}',
          ' | ',
          '{{#if s3}}S3-YES{{else}}S3-NO{{/if}}',
        ].join('')

        const res1 = interpolateTokens(tpl, {
          s1: true,
          s1_sub: true,
          s2: true,
          s2_sub: false,
          s3: true,
        })
        expect(res1).toBe('Prefix: S1-SUB | S2-DEFAULT | S3-YES')

        const res2 = interpolateTokens(tpl, {
          s1: false,
          s2: true,
          s2_sub: true,
          s3: false,
        })
        expect(res2).toBe('Prefix: NO-S1 | S2-SUB | S3-NO')
      })

      it('evaluates sibling conditionals without else branches', () => {
        const tpl = '{{#if a}}[A]{{/if}}{{#if b}} [B]{{/if}}{{#if c}} [C]{{/if}}'
        expect(interpolateTokens(tpl, { a: true, b: false, c: true })).toBe('[A] [C]')
      })
    })

    describe('2.4 Prototype Leakage & Pollution Protection', () => {
      const testData = {
        student: {
          first_name: 'Aarav',
          last_name: 'Sharma',
          profile: {
            grade: '10th',
          },
        },
      }

      it('blocks access to constructor and returns empty string or fallback', () => {
        expect(interpolateTokens('{{student.constructor}}', testData)).toBe('')
        expect(interpolateTokens('{{student.constructor | "FALLBACK"}}', testData)).toBe('FALLBACK')
        expect(interpolateTokens('{{student.profile.constructor}}', testData)).toBe('')
        expect(interpolateTokens('{{student.profile.constructor | "SAFE"}}', testData)).toBe('SAFE')
      })

      it('blocks access to __proto__ and returns empty string or fallback', () => {
        expect(interpolateTokens('{{student.__proto__}}', testData)).toBe('')
        expect(interpolateTokens('{{student.__proto__ | "FALLBACK"}}', testData)).toBe('FALLBACK')
        expect(interpolateTokens('{{student.profile.__proto__}}', testData)).toBe('')
        expect(interpolateTokens('{{student.profile.__proto__ | "SAFE"}}', testData)).toBe('SAFE')
      })

      it('blocks access to toString and returns empty string or fallback', () => {
        expect(interpolateTokens('{{student.toString}}', testData)).toBe('')
        expect(interpolateTokens('{{student.toString | "FALLBACK"}}', testData)).toBe('FALLBACK')
        expect(interpolateTokens('{{student.profile.toString}}', testData)).toBe('')
        expect(interpolateTokens('{{student.profile.toString | "SAFE"}}', testData)).toBe('SAFE')
      })

      it('blocks access to valueOf and returns empty string or fallback', () => {
        expect(interpolateTokens('{{student.valueOf}}', testData)).toBe('')
        expect(interpolateTokens('{{student.valueOf | "FALLBACK"}}', testData)).toBe('FALLBACK')
        expect(interpolateTokens('{{student.profile.valueOf}}', testData)).toBe('')
        expect(interpolateTokens('{{student.profile.valueOf | "SAFE"}}', testData)).toBe('SAFE')
      })

      it('blocks access to prototype property and returns empty string or fallback', () => {
        expect(interpolateTokens('{{student.prototype}}', testData)).toBe('')
        expect(interpolateTokens('{{student.prototype | "FALLBACK"}}', testData)).toBe('FALLBACK')
      })

      it('blocks root-level prototype queries', () => {
        expect(interpolateTokens('{{constructor}}', testData)).toBe('')
        expect(interpolateTokens('{{constructor | "SAFE"}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{__proto__}}', testData)).toBe('')
        expect(interpolateTokens('{{__proto__ | "SAFE"}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{toString}}', testData)).toBe('')
        expect(interpolateTokens('{{toString | "SAFE"}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{valueOf}}', testData)).toBe('')
        expect(interpolateTokens('{{valueOf | "SAFE"}}', testData)).toBe('SAFE')
      })

      it('evaluates prototype properties as falsy in #if conditionals', () => {
        expect(interpolateTokens('{{#if student.constructor}}LEAKED{{else}}SAFE{{/if}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{#if student.__proto__}}LEAKED{{else}}SAFE{{/if}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{#if student.toString}}LEAKED{{else}}SAFE{{/if}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{#if student.valueOf}}LEAKED{{else}}SAFE{{/if}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{#if constructor}}LEAKED{{else}}SAFE{{/if}}', testData)).toBe('SAFE')
        expect(interpolateTokens('{{#if __proto__}}LEAKED{{else}}SAFE{{/if}}', testData)).toBe('SAFE')
      })

      it('resists prototype pollution on Object.prototype without leaking to templates', () => {
        // Pollute Object.prototype temporarily
        const pollutedKey = '__empirical_polluted_key__'
        ;(Object.prototype as any)[pollutedKey] = 'EXPLOITED'

        try {
          // Token lookup should reject inherited polluted properties
          expect(resolvePathValue(testData, `student.${pollutedKey}`)).toBeUndefined()
          expect(interpolateTokens(`{{student.${pollutedKey}}}`, testData)).toBe('')
          expect(interpolateTokens(`{{student.${pollutedKey} | "GUARDED"}}`, testData)).toBe('GUARDED')
          expect(interpolateTokens(`{{#if student.${pollutedKey}}}LEAK{{else}}GUARDED{{/if}}`, testData)).toBe('GUARDED')
        } finally {
          delete (Object.prototype as any)[pollutedKey]
        }
      })
    })

    describe('2.5 Robustness & Boundary Stress', () => {
      it('evaluates a 20-level deeply nested conditional without stack overflow', () => {
        let nestedTpl = 'INNERMOST'
        const data: Record<string, boolean> = {}
        for (let i = 20; i >= 1; i--) {
          nestedTpl = `{{#if level_${i}}}${nestedTpl}{{else}}FAIL_${i}{{/if}}`
          data[`level_${i}`] = true
        }

        const start = performance.now()
        const result = interpolateTokens(nestedTpl, data)
        const duration = performance.now() - start

        expect(result).toBe('INNERMOST')
        expect(duration).toBeLessThan(50) // Fast execution without exponential slowdown
      })

      it('evaluates 100 sequential sibling conditional blocks under 50ms', () => {
        let tpl = ''
        const data: Record<string, boolean> = {}
        for (let i = 0; i < 100; i++) {
          tpl += `{{#if flag_${i}}}T${i}{{else}}F${i}{{/if}} `
          data[`flag_${i}`] = i % 2 === 0
        }

        const start = performance.now()
        const result = interpolateTokens(tpl, data)
        const duration = performance.now() - start

        expect(duration).toBeLessThan(100)
        expect(result.startsWith('T0 F1 T2 F3')).toBe(true)
      })

      it('safely handles unclosed, unmatched, or corrupted conditionals without hanging', () => {
        // Unclosed #if
        expect(interpolateTokens('{{#if unclosed}}Content without end', { unclosed: true }))
          .toBe('{{#if unclosed}}Content without end')

        // Dangling {{/if}}
        expect(interpolateTokens('Dangling {{/if}} here', {})).toBe('Dangling {{/if}} here')

        // Dangling {{else}} is stripped as unresolved token by default, preserved when keepUnresolvedTokens is true
        expect(interpolateTokens('Dangling {{else}} here', {})).toBe('Dangling  here')
        expect(interpolateTokens('Dangling {{else}} here', {}, { keepUnresolvedTokens: true }))
          .toBe('Dangling {{else}} here')

        // Inverted tags: unclosed #if preserves unclosed portion
        expect(interpolateTokens('{{/if}} Inverted {{#if x}}Content{{/if}}', { x: true }))
          .toBe('{{/if}} Inverted Content')
      })
    })
  })

  describe('3. Barcode Boundary & Extreme Parameter Stress', () => {
    it('handles empty value, undefined, and extreme dimension bounds safely', () => {
      // Empty value
      const emptySvg = generateBarcodeSvg('', { showText: true })
      const docEmpty = new DOMParser().parseFromString(emptySvg, 'image/svg+xml')
      expect(docEmpty.querySelector('parsererror')).toBeNull()
      expect(docEmpty.querySelector('text')?.textContent).toBe('123456')

      // Negative quietZone and barHeight
      const clampedSvg = generateBarcodeSvg('CLAMP-TEST', {
        quietZoneMm: -5,
        barHeightPercent: -50,
      })
      const docClamped = new DOMParser().parseFromString(clampedSvg, 'image/svg+xml')
      expect(docClamped.querySelector('parsererror')).toBeNull()

      // Large 300-char alphanumeric string
      const longPayload = 'CAMPUSONE-'.repeat(30)
      const longSvg = generateBarcodeSvg(longPayload, { format: 'CODE128', showText: true })
      const docLong = new DOMParser().parseFromString(longSvg, 'image/svg+xml')
      expect(docLong.querySelector('parsererror')).toBeNull()
      expect(docLong.querySelector('text')?.textContent).toBe(longPayload)
    })
  })
})
