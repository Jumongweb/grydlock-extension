import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listeners: Parameters<typeof chrome.runtime.onMessage.addListener>[0][] = []
const removedListeners: ((windowId: number) => void)[] = []
let nextWindowId = 100

const mockChrome = {
  runtime: {
    getURL: (path: string) => `chrome-extension://mock-id/${path}`,
    onMessage: {
      addListener: vi.fn((fn) => {
        listeners.push(fn)
      }),
    },
  },
  windows: {
    create: vi.fn((opts, cb) => {
      const winId = nextWindowId++
      // Run callback asynchronously
      setTimeout(() => {
        if (cb) cb({ id: winId })
      }, 0)
    }),
    onRemoved: {
      addListener: vi.fn((fn) => {
        removedListeners.push(fn)
      }),
    },
  },
}

vi.stubGlobal('chrome', mockChrome)

// Mock dependencies to control scoring and destination extraction
vi.mock('../decode/decodeTransaction', () => ({
  extractDestination: vi.fn(() => ({ destination: 'GDEST' })),
}))
vi.mock('../adapter/oracleAdapter', () => ({
  getScore: vi.fn(() => Promise.resolve(10)),
}))

// Import background to trigger its event listeners register
const {
  MAX_REQUESTS_PER_MINUTE,
  activeWindows,
  queues,
  requestTimestamps,
  pendingDecisions,
} = await import('./background')

describe('background script', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    requestTimestamps.clear()
    queues.clear()
    activeWindows.clear()
    pendingDecisions.clear()
    vi.mocked(mockChrome.windows.create).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('queues subsequent requests and only opens one window at a time per tab', async () => {
    const sender = { tab: { id: 1 } } as unknown as chrome.runtime.MessageSender
    const sendResponse1 = vi.fn()
    const sendResponse2 = vi.fn()

    // First request
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-1', xdr: 'xdr-1' }, sender, sendResponse1)
    
    // Resolve the async window creation callback
    await vi.runAllTimersAsync()
    expect(mockChrome.windows.create).toHaveBeenCalledTimes(1)
    expect(activeWindows.get('tab-1')).toEqual({ windowId: 100, requestId: 'req-1' })

    // Second request from same tab should get queued
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-2', xdr: 'xdr-2' }, sender, sendResponse2)
    await vi.runAllTimersAsync()

    // No new window should be created yet
    expect(mockChrome.windows.create).toHaveBeenCalledTimes(1)
    expect(queues.get('tab-1')?.length).toBe(1)

    // Simulate user choosing to proceed on request 1
    listeners[0]({ type: 'DECISION_MADE', requestId: 'req-1', decision: 'proceed' }, sender, vi.fn())
    await vi.runAllTimersAsync()

    // First request should resolve with 'proceed'
    expect(sendResponse1).toHaveBeenCalledWith({
      type: 'SIGN_OUTCOME',
      requestId: 'req-1',
      outcome: 'proceed',
    })

    // Now the second window should be created
    expect(mockChrome.windows.create).toHaveBeenCalledTimes(2)
    expect(activeWindows.get('tab-1')).toEqual({ windowId: 101, requestId: 'req-2' })

    // Simulate user canceling request 2
    listeners[0]({ type: 'DECISION_MADE', requestId: 'req-2', decision: 'cancel' }, sender, vi.fn())
    await vi.runAllTimersAsync()

    expect(sendResponse2).toHaveBeenCalledWith({
      type: 'SIGN_OUTCOME',
      requestId: 'req-2',
      outcome: 'cancel',
    })
  })

  it('enforces rate limiting: cancels requests exceeding limit', async () => {
    const sender = { tab: { id: 2 } } as unknown as chrome.runtime.MessageSender

    // Fire MAX_REQUESTS_PER_MINUTE rapid requests
    const responses: unknown[] = []
    for (let i = 0; i < MAX_REQUESTS_PER_MINUTE; i++) {
      const sendResponse = vi.fn()
      responses.push(sendResponse)
      listeners[0]({ type: 'SIGN_REQUEST', requestId: `req-limit-${i}`, xdr: 'xdr' }, sender, sendResponse)
    }

    await vi.runAllTimersAsync()
    // 5 windows should be queued/processing, but only 1 window is actually created at first
    expect(mockChrome.windows.create).toHaveBeenCalledTimes(1)

    // The 6th request should be rate-limited and immediately canceled
    const sendResponse6 = vi.fn()
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-limit-6', xdr: 'xdr' }, sender, sendResponse6)
    await vi.runAllTimersAsync()

    expect(sendResponse6).toHaveBeenCalledWith({
      type: 'SIGN_OUTCOME',
      requestId: 'req-limit-6',
      outcome: 'cancel',
    })

    // Advance time by 61 seconds, rate limit should reset
    vi.advanceTimersByTime(61000)

    const sendResponseNew = vi.fn()
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-new', xdr: 'xdr' }, sender, sendResponseNew)
    await vi.runAllTimersAsync()

    // This one should be accepted (added to queue or active windows)
    expect(sendResponseNew).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancel' }))
  })

  it('handles manual window closure by canceling the active request and continuing the queue', async () => {
    const sender = { tab: { id: 3 } } as unknown as chrome.runtime.MessageSender
    const sendResponse1 = vi.fn()
    const sendResponse2 = vi.fn()

    // Start request 1
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-close-1', xdr: 'xdr' }, sender, sendResponse1)
    await vi.runAllTimersAsync()
    expect(mockChrome.windows.create).toHaveBeenCalledTimes(1)

    // Start request 2
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-close-2', xdr: 'xdr' }, sender, sendResponse2)
    await vi.runAllTimersAsync()

    // Trigger onRemoved for the first window (id 103, since nextWindowId increments)
    const activeWin = activeWindows.get('tab-3')
    expect(activeWin?.windowId).toBeDefined()
    
    // Simulate window removal listener
    removedListeners[0](activeWin?.windowId as number)
    await vi.runAllTimersAsync()

    // Request 1 should resolve to cancel
    expect(sendResponse1).toHaveBeenCalledWith({
      type: 'SIGN_OUTCOME',
      requestId: 'req-close-1',
      outcome: 'cancel',
    })

    // Next request in queue should now start
    expect(mockChrome.windows.create).toHaveBeenCalledTimes(2)
  })

  it('keeps queues and rate limits separate for different tabs', async () => {
    const senderTab1 = { tab: { id: 4 } } as unknown as chrome.runtime.MessageSender
    const senderTab2 = { tab: { id: 5 } } as unknown as chrome.runtime.MessageSender

    const sendResponseTab1 = vi.fn()
    const sendResponseTab2 = vi.fn()

    // Request on tab 4
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-tab4', xdr: 'xdr' }, senderTab1, sendResponseTab1)
    // Request on tab 5
    listeners[0]({ type: 'SIGN_REQUEST', requestId: 'req-tab5', xdr: 'xdr' }, senderTab2, sendResponseTab2)

    await vi.runAllTimersAsync()

    // Both should create windows (since they are in separate queues)
    expect(mockChrome.windows.create).toHaveBeenCalledTimes(2)
    expect(activeWindows.has('tab-4')).toBe(true)
    expect(activeWindows.has('tab-5')).toBe(true)
  })
})
