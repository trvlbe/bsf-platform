import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

vi.mock('../src/lib/auth.js', () => ({
  useAuth: () => ({ user: { id: '1', name: 'TJ', email: 'tj@test.com', avatarUrl: null }, isLoading: false, isAuthenticated: true }),
  AuthProvider: ({ children }: any) => children,
}))
vi.mock('../src/lib/api.js', () => ({ api: { createCampaign: vi.fn(), fetchDriveDoc: vi.fn().mockResolvedValue({ text: '' }) } }))

import NewCampaign from '../src/pages/NewCampaign.js'

describe('NewCampaign', () => {
  const qc = new QueryClient()

  it('renders step 1 with title field', () => {
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><NewCampaign /></MemoryRouter>
      </QueryClientProvider>
    )
    expect(screen.getByText(/basics/i)).toBeTruthy()
    expect(screen.getByLabelText(/title/i)).toBeTruthy()
  })

  it('navigates to step 2 on Next', () => {
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><NewCampaign /></MemoryRouter>
      </QueryClientProvider>
    )
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Think About Us' } })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/lyrics/i)).toBeTruthy()
  })
})
