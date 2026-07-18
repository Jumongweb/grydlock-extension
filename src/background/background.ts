import { extractDestination } from '../decode/decodeTransaction'
import { getScore } from '../adapter/oracleAdapter'
import { resolveOutcome } from '../intercept/resolveOutcome'
import type {
  Decision,
  RuntimeDecisionMadeMessage,
  RuntimeSignOutcomeMessage,
  RuntimeSignRequestMessage,
} from '../intercept/protocol'

type IncomingMessage = RuntimeSignRequestMessage | RuntimeDecisionMadeMessage

interface PendingDecision {
  resolve: (decision: Decision) => void
  windowId?: number
}

export const pendingDecisions = new Map<string, PendingDecision>()

export function requestDecision(
  requestId: string,
  info: { destination: string; asset?: string; score: number },
): Promise<Decision> {
  return new Promise((resolve) => {
    const pending: PendingDecision = { resolve }
    pendingDecisions.set(requestId, pending)

    const params = new URLSearchParams({
      mode: 'intercept',
      requestId,
      destination: info.destination,
      score: String(info.score),
    })
    if (info.asset) params.set('asset', info.asset)

    chrome.windows
      .create({
        url: chrome.runtime.getURL(`src/popup/index.html?${params.toString()}`),
        type: 'popup',
        width: 320,
        height: 420,
      })
      .then((win) => {
        pending.windowId = win?.id
      })
  })
}

export function handleDecisionMade(requestId: string, decision: Decision): void {
  pendingDecisions.get(requestId)?.resolve(decision)
  pendingDecisions.delete(requestId)
}

export function handleWindowRemoved(windowId: number): void {
  for (const [requestId, pending] of pendingDecisions) {
    if (pending.windowId === windowId) {
      pending.resolve('cancel')
      pendingDecisions.delete(requestId)
      return
    }
  }
}

chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse) => {
  if (message.type === 'SIGN_REQUEST') {
    resolveOutcome(message.xdr, {
      extractDestination,
      getScore,
      requestDecision: (info) => requestDecision(message.requestId, info),
    }).then((outcome) => {
      const response: RuntimeSignOutcomeMessage = {
        type: 'SIGN_OUTCOME',
        requestId: message.requestId,
        outcome,
      }
      sendResponse(response)
    })

    return true
  }

  if (message.type === 'DECISION_MADE') {
    handleDecisionMade(message.requestId, message.decision)
  }

  return undefined
})

chrome.windows.onRemoved.addListener(handleWindowRemoved)
