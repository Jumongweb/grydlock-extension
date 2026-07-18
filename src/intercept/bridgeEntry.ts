import {
  WINDOW_REQUEST_TYPE,
  WINDOW_RESPONSE_TYPE,
  type RuntimeSignOutcomeMessage,
  type RuntimeSignRequestMessage,
} from './protocol'

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data as { type?: string; localId?: string; xdr?: string } | undefined
  if (data?.type !== WINDOW_REQUEST_TYPE || !data.localId || !data.xdr) return

  const localId = data.localId
  // Generated here, in the isolated world, so it's never exposed to the
  // page's own JS context via postMessage -- only this requestId is ever
  // used to key background.ts's pendingDecisions map.
  const requestId = crypto.randomUUID()

  const message: RuntimeSignRequestMessage = {
    type: 'SIGN_REQUEST',
    requestId,
    xdr: data.xdr,
  }

  chrome.runtime.sendMessage(message, (response: RuntimeSignOutcomeMessage | undefined) => {
    window.postMessage(
      { type: WINDOW_RESPONSE_TYPE, localId, outcome: response?.outcome ?? 'cancel' },
      '*',
    )
  })
})
