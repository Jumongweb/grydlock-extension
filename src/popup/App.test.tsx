import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import * as adapter from '../adapter/oracleAdapter'

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading state before the adapter resolves', () => {
    vi.spyOn(adapter, 'getScore').mockReturnValue(new Promise(() => {}))
    render(<App />)
    expect(screen.getByText(/checking destination/i)).toBeInTheDocument()
  })

  it('renders the matching tier once the adapter resolves', async () => {
    vi.spyOn(adapter, 'getScore').mockResolvedValue(85)
    render(<App />)
    expect(await screen.findByText('Critical risk')).toBeInTheDocument()
    expect(screen.getByText('Score: 85')).toBeInTheDocument()
  })

  it('shows a retry option when the adapter call fails', async () => {
    vi.spyOn(adapter, 'getScore').mockRejectedValue(new Error('network down'))
    render(<App />)
    expect(await screen.findByText(/could not reach the risk oracle/i)).toBeInTheDocument()
  })

  it('retries the adapter call when Retry is clicked', async () => {
    vi.spyOn(adapter, 'getScore')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(10)
    render(<App />)
    fireEvent.click(await screen.findByText('Retry'))
    expect(await screen.findByText('Low risk')).toBeInTheDocument()
  })

  it('lets the dev slider override the displayed tier', async () => {
    vi.spyOn(adapter, 'getScore').mockResolvedValue(10)
    render(<App />)
    await screen.findByText('Low risk')
    fireEvent.change(screen.getByLabelText(/dev: override score/i), { target: { value: '90' } })
    expect(await screen.findByText('Critical risk')).toBeInTheDocument()
  })
})
