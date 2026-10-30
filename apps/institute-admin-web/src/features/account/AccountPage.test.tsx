import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountPage } from './AccountPage'
import { getAccountProfile, importAccountFields, updateAccountProfile, uploadAccountPhoto, type AccountProfile } from './account.api'

vi.mock('./account.api', () => ({
  getAccountProfile: vi.fn(),
  updateAccountProfile: vi.fn(),
  uploadAccountPhoto: vi.fn(),
  importAccountFields: vi.fn(),
}))

const account: AccountProfile = {
  id: 'user-1', displayName: 'Asha Rao', firstName: 'Asha', lastName: 'Rao',
  email: 'asha@example.test', phone: '', phoneVerified: false, photoUrl: null,
  alternateEmail: '', alternateEmailVerified: false, activeRole: 'TEACHER', roles: ['TEACHER'],
  institute: 'North Academy', branch: 'Main Campus',
  personal: { dateOfBirth: null, gender: null, bloodGroup: null, maritalStatus: null, fatherName: null, motherName: null, currentAddress: null, permanentAddress: null },
  workExperience: { qualification: 'BEd', experienceYears: 3, previousWorkplace: 'Old School' },
  staff: { institute: 'North Academy', employeeCode: 'T-12', department: 'Science', employmentType: 'FULL_TIME', joiningDate: '2022-06-01', shift: 'Morning', workLocation: 'Block A', importable: {} },
}

describe('My Account', () => {
  beforeEach(() => {
    vi.mocked(getAccountProfile).mockResolvedValue(account)
    vi.mocked(updateAccountProfile).mockImplementation(async (_token, values) => ({
      ...account,
      alternateEmail: values.alternateEmail ?? account.alternateEmail,
      workExperience: { ...account.workExperience, ...values },
    }))
    vi.mocked(uploadAccountPhoto).mockResolvedValue({ photoUrl: 'https://example.test/photo.jpg' })
    vi.mocked(importAccountFields).mockResolvedValue({ imported: [], skipped: [], profile: account })
  })

  it('keeps account identity and institute HR information read-only', async () => {
    render(<AccountPage accessToken="token" />)
    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeInTheDocument()
    expect(screen.getByText('asha@example.test')).toBeInTheDocument()
    expect(screen.getByText('T-12')).toBeInTheDocument()
    expect(screen.getByText(/Managed by North Academy/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit.*name|edit.*sign-in/i })).not.toBeInTheDocument()
  })

  it('saves work experience to the account profile without exposing identity fields', async () => {
    const user = userEvent.setup()
    render(<AccountPage accessToken="token" />)
    await user.click(await screen.findByRole('button', { name: 'Edit work experience' }))
    const years = screen.getByLabelText('Years of experience')
    await user.clear(years)
    await user.type(years, '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateAccountProfile).toHaveBeenCalledWith('token', {
      qualification: 'BEd', experienceYears: 5, previousWorkplace: 'Old School',
    }))
    expect(screen.getByText('Work experience saved to your account profile.')).toBeInTheDocument()
    expect(updateAccountProfile).not.toHaveBeenCalledWith('token', expect.objectContaining({ firstName: expect.anything(), email: expect.anything() }))
  })

  it('offers a real photo control and uses the self-service photo endpoint', async () => {
    render(<AccountPage accessToken="token" />)
    const input = await screen.findByLabelText('Add photo')
    const file = new File(['image'], 'profile.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(uploadAccountPhoto).toHaveBeenCalledWith('token', file))
  })
})
