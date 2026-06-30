import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import App from '../src/App.js'

describe('app smoke', () => {
  it('renders without crashing', () => {
    render(<App />)
    expect(document.body).toBeTruthy()
  })
})
