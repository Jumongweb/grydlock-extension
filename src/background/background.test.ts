import { beforeEach, describe, expect, it, vi } from 'vitest'

const chromeMock = {
  runtime: {
    onMessage: { addListener: vi.fn() },
    getURL: (path: string) => path,
  },
  windows: {
    create: vi.fn(),
  },
}

vi.stubGlobal('chrome', chromeMock)

const { pendingDecisions, requestDecision, handleDecisionMade } = await import('./background')

describe('background DECISION_MADE sender validation', () => {
  beforeEach(() => {
    pendingDecisions.clear()
    chromeMock.windows.create.mockReset()
  })

  it('resolves the pending decision when it comes from the review popup window', async () => {
    chromeMock.windows.create.mockResolvedValue({ id: 42 })

    const decisionPromise = requestDecision('req-1', { destination: 'GDEST', score: 10 })
    await Promise.resolve()
    await Promise.resolve()

    handleDecisionMade('req-1', 'proceed', 42)

    await expect(decisionPromise).resolves.toBe('proceed')
    expect(pendingDecisions.has('req-1')).toBe(false)
  })

  it('ignores a DECISION_MADE from a different window and leaves the request pending', async () => {
    chromeMock.windows.create.mockResolvedValue({ id: 42 })

    const decisionPromise = requestDecision('req-2', { destination: 'GDEST', score: 10 })
    await Promise.resolve()
    await Promise.resolve()

    handleDecisionMade('req-2', 'proceed', 999)

    const spy = vi.fn()
    decisionPromise.then(spy)
    await Promise.resolve()
    await Promise.resolve()

    expect(spy).not.toHaveBeenCalled()
    expect(pendingDecisions.has('req-2')).toBe(true)

    handleDecisionMade('req-2', 'proceed', 42)
    await expect(decisionPromise).resolves.toBe('proceed')
  })

  it('ignores a DECISION_MADE that arrives before the popup window is known', async () => {
    chromeMock.windows.create.mockReturnValue(new Promise(() => {}))

    const decisionPromise = requestDecision('req-3', { destination: 'GDEST', score: 10 })

    handleDecisionMade('req-3', 'proceed', undefined)

    const spy = vi.fn()
    decisionPromise.then(spy)
    await Promise.resolve()
    await Promise.resolve()

    expect(spy).not.toHaveBeenCalled()
    expect(pendingDecisions.has('req-3')).toBe(true)
  })

  it('is a no-op for an unknown requestId', () => {
    expect(() => handleDecisionMade('does-not-exist', 'cancel', 1)).not.toThrow()
  })
})
