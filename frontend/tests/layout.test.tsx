import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppShell } from '../src/components/layout/AppShell.js'
import { StatusBadge } from '../src/components/ui/StatusBadge.js'
import { MetricTile } from '../src/components/ui/MetricTile.js'

describe('layout components', () => {
  it('AppShell renders nav and main', () => {
    render(
      <MemoryRouter>
        <AppShell user={{ name: 'TJ', email: 'tj@test.com', avatarUrl: null }}>
          <div>content</div>
        </AppShell>
      </MemoryRouter>
    )
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.getByText('CAMPAIGNS')).toBeTruthy()
  })

  it('StatusBadge renders correct label', () => {
    const { rerender } = render(<StatusBadge status="DRAFT" />)
    expect(screen.getByText('Draft')).toBeTruthy()
    rerender(<StatusBadge status="GENERATED" />)
    expect(screen.getByText('Generated')).toBeTruthy()
    rerender(<StatusBadge status="ACTIVE" />)
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('MetricTile renders label and value', () => {
    render(<MetricTile label="Active Campaigns" value={3} delta="+1" />)
    expect(screen.getByText('Active Campaigns')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('+1')).toBeTruthy()
  })
})
