import { extractDestination } from '../decode/decodeTransaction'
import { getScore } from '../adapter/oracleAdapter'
import { resolveOutcome } from '../intercept/resolveOutcome'
import type { RuntimeSignRequestInfo } from '../intercept/protocol'
import type {
  Decision,
  RuntimeDecisionMadeMessage,
  RuntimeSignOutcomeMessage,
  RuntimeSignRequestMessage,
} from '../intercept/protocol'

type IncomingMessage = RuntimeSignRequestMessage | RuntimeDecisionMadeMessage

const pendingDecisions = new Map<string, (decision: Decision) => void>()

function requestDecision(
  requestId: string,
  info: RuntimeSignRequestInfo,
): Promise<Decision> {
  return new Promise((resolve) => {
    pendingDecisions.set(requestId, resolve)

    const params = new URLSearchParams({
      mode: 'intercept',
      requestId,
      destination: info.destination,
      score: String(info.score),
      kind: info.kind,
    })
    if (info.asset) params.set('asset', info.asset)
    if (info.function) params.set('function', info.function)

    chrome.windows.create({
      url: chrome.runtime.getURL(`src/popup/index.html?${params.toString()}`),
      type: 'popup',
      width: 320,
      height: 420,
    })
  })
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
    const resolve = pendingDecisions.get(message.requestId)
    resolve?.(message.decision)
    pendingDecisions.delete(message.requestId)
  }

  return undefined
})
