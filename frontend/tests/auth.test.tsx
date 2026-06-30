import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Login from '../src/pages/Login.js'

describe('auth pages', () => {
  it('Login renders sign-in button linking to Google OAuth', () => {
    render(<MemoryRouter><Login /></MemoryRouter>)
    const link = screen.getByRole('link', { name: /sign in with google/i })
    expect(link).toHaveAttribute('href', '/auth/google')
  })

  it('Login renders BSF brand text', () => {
    render(<MemoryRouter><Login /></MemoryRouter>)
    expect(screen.getByText(/blue sky fable/i)).toBeTruthy()
  })
})
