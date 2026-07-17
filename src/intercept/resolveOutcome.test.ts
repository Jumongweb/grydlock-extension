import { describe, expect, it, vi } from 'vitest'
import { resolveOutcome } from './resolveOutcome'

describe('resolveOutcome', () => {
  it('returns allow when no destination can be determined', async () => {
    const getScore = vi.fn()
    const requestDecision = vi.fn()

    const outcome = await resolveOutcome('some-xdr', {
      extractDestination: () => null,
      getScore,
      requestDecision,
    })

    expect(outcome).toBe('allow')
    expect(getScore).not.toHaveBeenCalled()
    expect(requestDecision).not.toHaveBeenCalled()
  })

  it('scores the destination and returns the requested decision', async () => {
    const getScore = vi.fn().mockResolvedValue(42)
    const requestDecision = vi.fn().mockResolvedValue('proceed')

    const outcome = await resolveOutcome('some-xdr', {
      extractDestination: () => ({ kind: 'payment', destination: 'GDEST', asset: 'USD:GISSUER' }),
      getScore,
      requestDecision,
    })

    expect(getScore).toHaveBeenCalledWith('GDEST')
    expect(requestDecision).toHaveBeenCalledWith({ destination: 'GDEST', kind: 'payment', asset: 'USD:GISSUER', score: 42 })
    expect(outcome).toBe('proceed')
  })

  it('returns cancel when the user cancels', async () => {
    const outcome = await resolveOutcome('some-xdr', {
      extractDestination: () => ({ kind: 'payment', destination: 'GDEST' }),
      getScore: async () => 90,
      requestDecision: async () => 'cancel',
    })

    expect(outcome).toBe('cancel')
  })

  it('scores a contract invocation and returns the requested decision', async () => {
    const getScore = vi.fn().mockResolvedValue(87)
    const requestDecision = vi.fn().mockResolvedValue('cancel')

    const outcome = await resolveOutcome('some-xdr', {
      extractDestination: () => ({ kind: 'contractInvocation', destination: 'GABCD...', function: 'transfer' }),
      getScore,
      requestDecision,
    })

    expect(getScore).toHaveBeenCalledWith('GABCD...')
    expect(requestDecision).toHaveBeenCalledWith({
      destination: 'GABCD...',
      kind: 'contractInvocation',
      function: 'transfer',
      score: 87,
    })
    expect(outcome).toBe('cancel')
  })
})
