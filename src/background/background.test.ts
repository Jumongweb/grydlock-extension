import { beforeEach, describe, expect, it, vi } from 'vitest'

const chromeMock = {
  runtime: {
    onMessage: { addListener: vi.fn() },
    getURL: (path: string) => path,
  },
  windows: {
    create: vi.fn(),
    onRemoved: { addListener: vi.fn() },
  },
}

vi.stubGlobal('chrome', chromeMock)

const { pendingDecisions, requestDecision, handleWindowRemoved, handleDecisionMade } =
  await import('./background')

describe('background window-closed handling', () => {
  beforeEach(() => {
    pendingDecisions.clear()
    chromeMock.windows.create.mockReset()
  })

  it('resolves the pending decision to cancel and clears the entry when its window is closed', async () => {
    chromeMock.windows.create.mockResolvedValue({ id: 42 })

    const decisionPromise = requestDecision('req-1', { destination: 'GDEST', score: 10 })
    await Promise.resolve()
    await Promise.resolve()

    expect(pendingDecisions.get('req-1')?.windowId).toBe(42)

    handleWindowRemoved(42)

    await expect(decisionPromise).resolves.toBe('cancel')
    expect(pendingDecisions.has('req-1')).toBe(false)
  })

  it('leaves unrelated pending decisions untouched when a different window closes', async () => {
    chromeMock.windows.create.mockResolvedValue({ id: 1 })

    const decisionPromise = requestDecision('req-2', { destination: 'GDEST', score: 10 })
    await Promise.resolve()
    await Promise.resolve()

    handleWindowRemoved(999)

    expect(pendingDecisions.has('req-2')).toBe(true)

    handleDecisionMade('req-2', 'proceed')
    await expect(decisionPromise).resolves.toBe('proceed')
  })

  it('is a no-op when no pending decision matches the closed window', () => {
    expect(() => handleWindowRemoved(123)).not.toThrow()
    expect(pendingDecisions.size).toBe(0)
  })
})
