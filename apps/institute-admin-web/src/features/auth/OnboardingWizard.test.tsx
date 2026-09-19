import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingWizard } from './OnboardingWizard'

vi.mock('./auth.api', async () => {
  const actual = await vi.importActual<typeof import('./auth.api')>('./auth.api')
  return { ...actual, checkSlugAvailability: vi.fn() }
})

import { checkSlugAvailability } from './auth.api'

describe('OnboardingWizard slug validation', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(checkSlugAvailability).mockResolvedValue({ slug: 'oakridge', available: false, message: 'This URL name is already taken.' })
  })

  it('checks a valid slug after typing pauses and displays the inline result', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard stepId="institute" onStepChange={vi.fn()} onAuthenticated={vi.fn()} onExit={vi.fn()} />)

    const slug = screen.getByLabelText(/institute url name/i)
    expect(screen.getByText(/cannot be changed after your institute is created/i)).toBeInTheDocument()
    await user.type(slug, 'oakridge')

    expect(screen.getByText(/cannot be changed after your institute is created/i)).toBeInTheDocument()
    await waitFor(() => expect(checkSlugAvailability).toHaveBeenCalledWith('oakridge', expect.any(AbortSignal)))
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument()
  })
})
