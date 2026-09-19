import { describe, expect, it } from 'vitest'
import { getInstituteSlugFromHostname } from './auth.api'

describe('institute hostname resolution', () => {
  it('does not treat the shared institute host as a slug', () => {
    expect(getInstituteSlugFromHostname('institute.snifply.com')).toBeNull()
  })

  it('extracts a registered institute slug from a custom host', () => {
    expect(getInstituteSlugFromHostname('ab-international.snifply.com')).toBe('ab-international')
  })
})
