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
  // windowId of the review popup we ourselves created for this request, set
  // once chrome.windows.create resolves. DECISION_MADE is only honored from
  // that same window, so a forged message from elsewhere (e.g. a compromised
  // content script in the dApp's own tab) can't short-circuit the review.
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

export function handleDecisionMade(requestId: string, decision: Decision, senderWindowId?: number): void {
  const pending = pendingDecisions.get(requestId)
  if (!pending) return
  // pending.windowId is only unset before chrome.windows.create resolves --
  // no legitimate DECISION_MADE can arrive before the review popup exists.
  if (pending.windowId === undefined || pending.windowId !== senderWindowId) return

  pending.resolve(decision)
  pendingDecisions.delete(requestId)
}

chrome.runtime.onMessage.addListener((message: IncomingMessage, sender, sendResponse) => {
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
    handleDecisionMade(message.requestId, message.decision, sender.tab?.windowId)
  }

  return undefined
})
