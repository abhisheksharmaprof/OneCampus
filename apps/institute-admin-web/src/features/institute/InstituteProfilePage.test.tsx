import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstituteProfilePage } from './InstituteProfilePage'

describe('InstituteProfilePage identity details', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/files?')
        ? { success: true, data: [] }
        : String(input).includes('/branches?')
          ? { success: true, data: { items: [] } }
          : { success: true, data: { id: 'institute-1', name: 'Greenfield High', slug: 'greenfield-high', code: 'GREENFIELD-1', isActive: true } },
    })))
  })

  it('shows the institute slug in the identity section', async () => {
    render(<InstituteProfilePage accessToken="access-token" />)

    expect(await screen.findByDisplayValue('greenfield-high')).toBeInTheDocument()
  })
})
