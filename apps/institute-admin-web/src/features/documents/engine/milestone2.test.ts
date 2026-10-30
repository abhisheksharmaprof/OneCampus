import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_MERGE_FIELDS,
  interpolateTokens,
  extractTokens,
  computeAutoFitFontSize,
  generateBarcodeSvg,
  generateQrSvg,
  buildRenderPlan,
  renderDocumentHtml,
  type LayoutV3,
  type ElementV3,
  type ShapeElementV3,
  type DividerElementV3,
  type PhotoElementV3,
  type BarcodeElementV3,
  type QrCodeElementV3,
} from '@campusone/document-engine'

describe('Milestone 2 - Merge Fields & Token Interpolation (TS-11)', () => {
  it('contains canonical 36 merge fields catalog with required metadata', () => {
    expect(DOCUMENT_MERGE_FIELDS.length).toBeGreaterThanOrEqual(36)
    for (const field of DOCUMENT_MERGE_FIELDS) {
      expect(field.id).toBeTruthy()
      expect(field.label).toBeTruthy()
      expect(field.category).toMatch(/^(institute|student|exam|finance|certificate|system)$/i)
      expect(field.fallback).toBeDefined()
    }
  })

  it('interpolates simple tokens and nested dot-notation tokens', () => {
    const data = {
      student: {
        full_name: 'Aarav Sharma',
        enrollment_no: 'EN-2026-0042',
        address: {
          city: 'Mumbai',
        },
      },
      school: {
        name: 'Delhi Public Academy',
      },
    }

    const tpl = 'Student: {{student.full_name}}, ID: {{student.enrollment_no}}, City: {{student.address.city}} - {{school.name}}'
    const result = interpolateTokens(tpl, data)
    expect(result).toBe('Student: Aarav Sharma, ID: EN-2026-0042, City: Mumbai - Delhi Public Academy')
  })

  it('handles fallback values when tokens are missing or undefined', () => {
    const data = {
      student: {
        full_name: 'Diya Patel',
      },
    }

    const tpl = 'Name: {{student.full_name | "Unknown"}}, Roll: {{student.roll_no | "N/A"}}, Bus: {{student.transport.route | "None"}}'
    const result = interpolateTokens(tpl, data)
    expect(result).toBe('Name: Diya Patel, Roll: N/A, Bus: None')
  })

  it('handles conditional {{#if}} blocks with truthy and falsy values', () => {
    const data1 = {
      student: {
        section: 'A',
        bus_route: null,
      },
    }
    const tpl1 = 'Class: 10{{#if student.section}} (Sec {{student.section}}){{/if}}{{#if student.bus_route}} [Bus {{student.bus_route}}]{{/if}}'
    expect(interpolateTokens(tpl1, data1)).toBe('Class: 10 (Sec A)')

    const data2 = {
      fee: {
        has_dues: true,
      },
    }
    const tpl2 = 'Status: {{#if fee.has_dues}}Fee Pending{{else}}All Clear{{/if}}'
    expect(interpolateTokens(tpl2, data2)).toBe('Status: Fee Pending')

    const data3 = {
      fee: {
        has_dues: false,
      },
    }
    expect(interpolateTokens(tpl2, data3)).toBe('Status: All Clear')
  })

  it('escapes dangerous HTML characters when escapeHtml is enabled to prevent XSS injection', () => {
    const data = {
      student: {
        full_name: '<script>alert("hack")</script>',
        remark: 'Math & Science > 90% "Top Tier"',
      },
    }
    const tpl = 'Name: {{student.full_name}}, Remark: {{student.remark}}'
    const result = interpolateTokens(tpl, data, { escapeHtml: true })
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;')
    expect(result).toContain('Math &amp; Science &gt; 90% &quot;Top Tier&quot;')
  })

  it('supports bidirectional aliases between legacy snake_case and dot-notation tokens', () => {
    const legacyData = {
      student_name: 'Rohit Verma',
      school_name: 'Greenwood High',
      roll_number: '42',
    }

    const tplDot = '{{student.full_name}} (Roll {{student.roll_no}}) at {{school.name}}'
    expect(interpolateTokens(tplDot, legacyData)).toBe('Rohit Verma (Roll 42) at Greenwood High')

    const modernData = {
      student: {
        full_name: 'Ananya Roy',
        roll_no: '15',
      },
      school: {
        name: 'St. Xavier School',
      },
    }
    const tplLegacy = '{{student_name}} [{{roll_number}}] of {{school_name}}'
    expect(interpolateTokens(tplLegacy, modernData)).toBe('Ananya Roy [15] of St. Xavier School')
  })

  it('extracts all token keys including fallbacks and conditionals', () => {
    const tpl = 'Welcome {{student.full_name | "Student"}}, roll {{student.roll_no}}. {{#if student.section}}Sec {{student.section}}{{/if}}'
    const tokens = extractTokens(tpl)
    expect(tokens).toContain('student.full_name')
    expect(tokens).toContain('student.roll_no')
    expect(tokens).toContain('student.section')
  })
})

describe('Milestone 2 - Auto-Fit Text Engine (TS-11)', () => {
  it('returns original font size when text comfortably fits inside box', () => {
    const text = 'Short Name'
    const res = computeAutoFitFontSize({
      text,
      widthMm: 80,
      heightMm: 20,
      baseFontSizePt: 16,
      minFontSizePt: 8,
      fontFamily: 'Inter',
    })
    expect(res.fittedFontSizePt).toBe(16)
    expect(res.isOverflow).toBe(false)
  })

  it('downscales font size when text is too long for the box width and height', () => {
    const text = 'International Institute of Advanced Computational Engineering and Aeronautical Systems Management'
    const res = computeAutoFitFontSize({
      text,
      widthMm: 50,
      heightMm: 10,
      baseFontSizePt: 24,
      minFontSizePt: 8,
      fontFamily: 'Inter',
    })
    expect(res.fittedFontSizePt).toBeLessThan(24)
    expect(res.fittedFontSizePt).toBeGreaterThanOrEqual(8)
  })

  it('flags overflow when text exceeds bounding box even at minFontSizePt', () => {
    const veryLongText = 'A '.repeat(500)
    const res = computeAutoFitFontSize({
      text: veryLongText,
      widthMm: 20,
      heightMm: 5,
      baseFontSizePt: 14,
      minFontSizePt: 8,
      fontFamily: 'Inter',
    })
    expect(res.fittedFontSizePt).toBe(8)
    expect(res.isOverflow).toBe(true)
  })
})

describe('Milestone 2 - Barcode & QR Code Vector Generation (TS-13)', () => {
  it('generates crisp SVG for Code 128 (Type B) barcode', () => {
    const svg = generateBarcodeSvg('STUDENT12345', {
      format: 'CODE128',
      showText: true,
      color: '#16212E',
      backgroundColor: '#FFFFFF',
    })

    expect(svg).toContain('<svg')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain('STUDENT12345')
    expect(svg).toContain('fill="#16212E"')
  })

  it('generates crisp SVG for Code 39 barcode with start/stop asterisks', () => {
    const svg = generateBarcodeSvg('CAMPUS-2026', {
      format: 'CODE39',
      showText: true,
    })

    expect(svg).toContain('<svg')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain('CAMPUS-2026')
  })

  it('generates crisp vector QR code with configurable error correction and quiet zone', () => {
    const svg = generateQrSvg('https://campusone.edu/verify/cert-9988', {
      errorCorrectionLevel: 'H',
      margin: 4,
      darkColor: '#0B4F6C',
      lightColor: '#FFFFFF',
    })

    expect(svg).toContain('<svg')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain('fill="#0B4F6C"')
    expect(svg).toContain('fill="#FFFFFF"')
  })
})

describe('Milestone 2 - Server HTML Export & Styling Compilation (TS-09, TS-10, TS-12)', () => {
  const baseLayout: LayoutV3 = {
    version: 3,
    page: {
      sizeId: 'A4P',
      orientation: 'PORTRAIT',
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    zones: { headerMm: 0, footerMm: 0 },
    pages: [{ id: 'p1', elements: [] }],
    watermark: { mode: 'none' },
  }

  it('injects Google Fonts link and fallback font stacks for custom typography', () => {
    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [
        {
          id: 'p1',
          elements: [
            {
              id: 'text-1',
              type: 'text',
              xMm: 10,
              yMm: 10,
              widthMm: 100,
              heightMm: 20,
              content: 'Certificate of Excellence',
              style: {
                fontFamily: 'Cinzel',
                fontSizePt: 22,
                bold: true,
                letterSpacingMm: 1.5,
                lineHeight: 1.4,
                textTransform: 'uppercase',
                verticalAlign: 'middle',
              },
            },
          ],
        },
      ],
    }

    const plan = buildRenderPlan(layout, { fields: {} })
    const html = renderDocumentHtml(plan)

    expect(html).toContain('fonts.googleapis.com/css2')
    expect(html).toContain('family=Cinzel')
    expect(html).toContain("font-family:'Cinzel'")
    expect(html).toContain('text-transform:uppercase')
    expect(html).toContain('letter-spacing:1.5mm')
  })

  it('renders shapes with linear gradients, per-edge borders, and 4-corner radii', () => {
    const shapeEl: ShapeElementV3 = {
      id: 'shape-1',
      type: 'shape',
      shapeType: 'rectangle',
      xMm: 15,
      yMm: 20,
      widthMm: 80,
      heightMm: 40,
      fill: {
        type: 'linear-gradient',
        angleDeg: 90,
        stops: [
          { color: '#1B365D', offset: 0 },
          { color: '#4B6B94', offset: 100 },
        ],
      },
      border: {
        unified: false,
        top: { widthMm: 1, color: '#D4AF37', style: 'solid' },
        bottom: { widthMm: 2, color: '#D4AF37', style: 'solid' },
      },
      cornerRadii: {
        unified: false,
        topLeftMm: 8,
        topRightMm: 0,
        bottomRightMm: 8,
        bottomLeftMm: 0,
      },
    }

    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [{ id: 'p1', elements: [shapeEl] }],
    }

    const plan = buildRenderPlan(layout, { fields: {} })
    const html = renderDocumentHtml(plan)

    expect(html).toContain('linear-gradient(90deg, #1B365D 0%, #4B6B94 100%)')
    expect(html).toContain('border-top:1mm solid #D4AF37')
    expect(html).toContain('border-bottom:2mm solid #D4AF37')
    expect(html).toContain('border-radius:8mm 0mm 8mm 0mm')
  })

  it('renders divider lines with dashed/dotted styles and orientation', () => {
    const dividerEl: DividerElementV3 = {
      id: 'div-1',
      type: 'divider',
      xMm: 10,
      yMm: 50,
      widthMm: 120,
      heightMm: 2,
      lineStyle: 'dashed',
      thicknessMm: 0.8,
      color: '#94A3B8',
    }

    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [{ id: 'p1', elements: [dividerEl] }],
    }

    const plan = buildRenderPlan(layout, { fields: {} })
    const html = renderDocumentHtml(plan)

    expect(html).toContain('border-top:0.8mm dashed #94A3B8')
  })

  it('renders photo frame with bound photo and fallback avatar when photo is missing', () => {
    const photoElWithMissingUrl: PhotoElementV3 = {
      id: 'photo-1',
      type: 'photo',
      xMm: 20,
      yMm: 30,
      widthMm: 25,
      heightMm: 30,
      aspectPreset: 'CR80_PHOTO',
      shape: 'rounded',
      dataKey: 'student.photo_url',
      showBorder: true,
      borderColor: '#D4AF37',
      borderWidthMm: 1,
    }

    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [{ id: 'p1', elements: [photoElWithMissingUrl] }],
    }

    // Render with missing photo url
    const planMissing = buildRenderPlan(layout, { fields: { 'student.photo_url': '' } })
    const htmlMissing = renderDocumentHtml(planMissing)

    // Should render fallback avatar vector silhouette
    expect(htmlMissing).toContain('<svg')
    expect(htmlMissing).toContain('circle')
    expect(htmlMissing).toContain('border:1mm solid #D4AF37')

    // Render with valid photo url
    const planPresent = buildRenderPlan(layout, {
      fields: { 'student.photo_url': 'https://cdn.campusone.test/students/aarav.jpg' },
    })
    const htmlPresent = renderDocumentHtml(planPresent)
    expect(htmlPresent).toContain('src="https://cdn.campusone.test/students/aarav.jpg"')
  })

  it('renders barcode and QR code elements directly as crisp vector SVGs', () => {
    const barcodeEl: BarcodeElementV3 = {
      id: 'bar-1',
      type: 'barcode',
      xMm: 10,
      yMm: 100,
      widthMm: 60,
      heightMm: 18,
      format: 'CODE128',
      staticValue: 'STU-9901',
      showText: true,
    }

    const qrEl: QrCodeElementV3 = {
      id: 'qr-1',
      type: 'qr',
      xMm: 80,
      yMm: 100,
      widthMm: 25,
      heightMm: 25,
      staticText: 'https://campusone.edu/v/9901',
      eccLevel: 'M',
    }

    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [{ id: 'p1', elements: [barcodeEl, qrEl] }],
    }

    const plan = buildRenderPlan(layout, { fields: {} })
    const html = renderDocumentHtml(plan)

    expect(html).toContain('shape-rendering="crispEdges"')
    expect(html).toContain('STU-9901')
    expect(html).toContain('qr-1')
  })
})

describe('Milestone 2 - Render Plan Diagnostics & Asset Validation (TS-09 to TS-13)', () => {
  const baseLayout: LayoutV3 = {
    version: 3,
    page: {
      sizeId: 'A4P',
      orientation: 'PORTRAIT',
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    zones: { headerMm: 0, footerMm: 0 },
    pages: [{ id: 'p1', elements: [] }],
    watermark: { mode: 'none' },
  }

  it('emits MISSING_STUDENT_PHOTO diagnostic when photo element is present but student photo is absent', () => {
    const photoEl: PhotoElementV3 = {
      id: 'photo-missing',
      type: 'photo',
      xMm: 10,
      yMm: 10,
      widthMm: 35,
      heightMm: 45,
      dataKey: 'student.photo_url',
    }

    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [{ id: 'p1', elements: [photoEl] }],
    }

    const plan = buildRenderPlan(layout, { fields: {} })
    const photoDiag = plan.diagnostics.find((d) => d.code === 'MISSING_STUDENT_PHOTO')
    expect(photoDiag).toBeDefined()
    expect(photoDiag?.elementId).toBe('photo-missing')
  })

  it('emits TEXT_OVERFLOW diagnostic when text element with autoFit overflows minimum font size', () => {
    const overflowTextEl: ElementV3 = {
      id: 'overflow-text',
      type: 'text',
      xMm: 10,
      yMm: 10,
      widthMm: 20,
      heightMm: 5,
      content: 'The quick brown fox jumps over the lazy dog repeatedly again and again and again until overflow occurs.',
      style: {
        fontSizePt: 14,
        autoFit: true,
        minFontSizePt: 10,
      },
    }

    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [{ id: 'p1', elements: [overflowTextEl] }],
    }

    const plan = buildRenderPlan(layout, { fields: {} })
    const overflowDiag = plan.diagnostics.find((d) => d.code === 'TEXT_OVERFLOW')
    expect(overflowDiag).toBeDefined()
    expect(overflowDiag?.elementId).toBe('overflow-text')
  })

  it('permits SVG base64 data URLs in safeAssets regex', () => {
    const svgBase64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PC9zdmc+'
    const layout: LayoutV3 = {
      ...baseLayout,
      pages: [
        {
          id: 'p1',
          elements: [
            {
              id: 'img-svg',
              type: 'image',
              xMm: 10,
              yMm: 10,
              widthMm: 30,
              heightMm: 30,
              assetId: 'school-crest',
            },
          ],
        },
      ],
    }

    const plan = buildRenderPlan(
      layout,
      { fields: {} },
      { 'school-crest': svgBase64 },
    )

    expect(plan.assets['school-crest']).toBe(svgBase64)
  })
})

describe('Milestone 2 Remediation - Security & Robustness Tests', () => {
  describe('Barcode SVG Escaping & XML Validity', () => {
    it('escapes special characters and ampersands in safeVal to ensure valid XML', () => {
      const svg = generateBarcodeSvg('DPS & SONS / 2026', {
        format: 'CODE128',
        showText: true,
        backgroundColor: '#FFFFFF',
      })
      expect(svg).toContain('DPS &amp; SONS / 2026')
      expect(svg).not.toContain('DPS & SONS')

      // XML validity check
      const parser = new DOMParser()
      const doc = parser.parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror')).toBeNull()
    })

    it('neutralizes script injection in barcode value to eliminate DOM XSS', () => {
      const malicious = '</text><script>window.__xss=1</script>'
      const svg = generateBarcodeSvg(malicious, {
        showText: true,
      })
      expect(svg).not.toContain('<script>')
      expect(svg).toContain('&lt;/text&gt;&lt;script&gt;window.__xss=1&lt;/script&gt;')

      const parser = new DOMParser()
      const doc = parser.parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelectorAll('script').length).toBe(0)
      expect(doc.querySelector('text')?.textContent).toBe(malicious)
    })

    it('escapes color and backgroundColor attributes preventing attribute injection', () => {
      const svg = generateBarcodeSvg('TEST1234', {
        color: 'red" onmouseover="alert(1)',
        backgroundColor: 'blue"><script>alert(2)</script>',
      })
      expect(svg).toContain('fill="red&quot; onmouseover=&quot;alert(1)"')
      expect(svg).toContain('fill="blue&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;"')

      const parser = new DOMParser()
      const doc = parser.parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror')).toBeNull()
      expect(doc.querySelectorAll('script').length).toBe(0)
    })
  })

  describe('Nested Conditionals Scanner', () => {
    it('evaluates nested conditionals with both inner and outer branches correctly', () => {
      const tpl = 'Status: {{#if student.is_enrolled}}Enrolled ({{#if student.section}}Sec {{student.section}}{{else}}No Sec{{/if}}){{else}}Not Enrolled{{/if}}'

      expect(interpolateTokens(tpl, { student: { is_enrolled: true, section: 'A' } }))
        .toBe('Status: Enrolled (Sec A)')

      expect(interpolateTokens(tpl, { student: { is_enrolled: true, section: '' } }))
        .toBe('Status: Enrolled (No Sec)')

      expect(interpolateTokens(tpl, { student: { is_enrolled: false, section: 'A' } }))
        .toBe('Status: Not Enrolled')
    })

    it('evaluates deeply nested conditionals across 3+ levels without dangling tags', () => {
      const deepTpl = '{{#if l1}}1 [{{#if l2}}2 [{{#if l3}}3{{else}}No 3{{/if}}]{{else}}No 2{{/if}}]{{else}}No 1{{/if}}'

      expect(interpolateTokens(deepTpl, { l1: true, l2: true, l3: true })).toBe('1 [2 [3]]')
      expect(interpolateTokens(deepTpl, { l1: true, l2: true, l3: false })).toBe('1 [2 [No 3]]')
      expect(interpolateTokens(deepTpl, { l1: true, l2: false, l3: true })).toBe('1 [No 2]')
      expect(interpolateTokens(deepTpl, { l1: false, l2: true, l3: true })).toBe('No 1')
    })

    it('evaluates nested conditionals inside else branches (else-if chains)', () => {
      const tpl = '{{#if a}}Branch A{{else}}{{#if b}}Branch B{{else}}Branch C{{/if}}{{/if}}'

      expect(interpolateTokens(tpl, { a: true, b: false })).toBe('Branch A')
      expect(interpolateTokens(tpl, { a: false, b: true })).toBe('Branch B')
      expect(interpolateTokens(tpl, { a: false, b: false })).toBe('Branch C')
    })

    it('handles multiple sequential sibling conditionals containing nested blocks', () => {
      const tpl = '{{#if a}}{{#if b}}AB{{/if}}{{/if}} | {{#if c}}{{#if d}}CD{{/if}}{{/if}}'
      expect(interpolateTokens(tpl, { a: true, b: true, c: true, d: true })).toBe('AB | CD')
      expect(interpolateTokens(tpl, { a: true, b: false, c: true, d: true })).toBe(' | CD')
    })

    it('handles unclosed conditional gracefully without infinite loop or crash', () => {
      const tpl = 'Header: {{#if unclosed}}Content without end'
      expect(interpolateTokens(tpl, { unclosed: true })).toBe('Header: {{#if unclosed}}Content without end')
    })
  })

  describe('Prototype Pollution & Leakage Guards', () => {
    it('blocks access to constructor, __proto__, and prototype on nested objects', () => {
      const data = { student: { name: 'Aarav' } }
      const tpl = 'Constructor: {{student.constructor | "BLOCKED"}}, Proto: {{student.__proto__ | "BLOCKED"}}, Prototype: {{student.prototype | "BLOCKED"}}'
      expect(interpolateTokens(tpl, data)).toBe('Constructor: BLOCKED, Proto: BLOCKED, Prototype: BLOCKED')
    })

    it('blocks inherited object prototype methods like toString and valueOf', () => {
      const data = { student: { name: 'Aarav' } }
      const tpl = 'ToString: {{student.toString | "NONE"}}, ValueOf: {{student.valueOf | "NONE"}}'
      expect(interpolateTokens(tpl, data)).toBe('ToString: NONE, ValueOf: NONE')
    })

    it('blocks direct root-level constructor and __proto__ token access', () => {
      const tpl = '{{constructor | "SAFE"}} - {{__proto__ | "SAFE"}}'
      expect(interpolateTokens(tpl, {})).toBe('SAFE - SAFE')
    })

    it('safely handles null-prototype objects without throwing', () => {
      const nullProtoObj: any = Object.create(null)
      nullProtoObj.user = Object.create(null)
      nullProtoObj.user.name = 'Rohan'

      expect(interpolateTokens('{{user.name}}', nullProtoObj)).toBe('Rohan')
      expect(interpolateTokens('{{user.toString}}', nullProtoObj)).toBe('')
      expect(interpolateTokens('{{user.constructor}}', nullProtoObj)).toBe('')
    })
  })

  describe('Auto-Fit Non-Positive Bounds', () => {
    it('immediately flags overflow when widthMm or heightMm are zero or negative', () => {
      const resZeroW = computeAutoFitFontSize({
        text: 'Valid text',
        widthMm: 0,
        heightMm: 20,
        baseFontSizePt: 14,
        minFontSizePt: 6,
      })
      expect(resZeroW.overflows).toBe(true)
      expect(resZeroW.isOverflow).toBe(true)

      const resZeroH = computeAutoFitFontSize({
        text: 'Valid text',
        widthMm: 20,
        heightMm: 0,
        baseFontSizePt: 14,
        minFontSizePt: 6,
      })
      expect(resZeroH.overflows).toBe(true)
      expect(resZeroH.isOverflow).toBe(true)

      const resNeg = computeAutoFitFontSize({
        text: 'Valid text',
        widthMm: -10,
        heightMm: -5,
        baseFontSizePt: 14,
        minFontSizePt: 6,
      })
      expect(resNeg.overflows).toBe(true)
      expect(resNeg.isOverflow).toBe(true)

      const resEmptyZero = computeAutoFitFontSize({
        text: '',
        widthMm: 0,
        heightMm: 0,
      })
      expect(resEmptyZero.overflows).toBe(true)
      expect(resEmptyZero.isOverflow).toBe(true)

      const resPaddingExceeds = computeAutoFitFontSize({
        text: 'Text',
        widthMm: 10,
        heightMm: 10,
        paddingMm: 10,
      })
      expect(resPaddingExceeds.overflows).toBe(true)
      expect(resPaddingExceeds.isOverflow).toBe(true)
    })
  })
})
