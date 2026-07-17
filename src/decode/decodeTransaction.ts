import { Asset, FeeBumpTransaction, Networks, TransactionBuilder } from '@stellar/stellar-sdk'

export interface DecodedDestination {
  destination: string
  asset?: string
}

const DESTINATION_OPERATION_TYPES = new Set([
  'payment',
  'pathPaymentStrictSend',
  'pathPaymentStrictReceive',
  'createAccount',
])

function assetLabel(op: Record<string, unknown>): string | undefined {
  try {
    const asset = (op.asset ?? op.destAsset) as Asset | undefined
    if (!asset || typeof asset !== 'object') return undefined
    if (typeof asset.isNative === 'function' && asset.isNative()) return undefined
    if (typeof asset.getCode === 'function' && typeof asset.getIssuer === 'function') {
      const code = asset.getCode()
      const issuer = asset.getIssuer()
      if (typeof code === 'string' && typeof issuer === 'string') {
        return `${code}:${issuer}`
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Extracts the single destination account an unsigned transaction pays to.
 * Returns null (never throws) when the XDR is malformed or the transaction
 * has no destination-bearing operation or more than one distinct destination
 * (e.g. a batch of payments to different accounts) — callers should treat
 * null as "can't determine a single destination to score."
 */
export function extractDestination(
  xdr: string,
  networkPassphrase: string = Networks.TESTNET,
): DecodedDestination | null {
  try {
    const parsed = TransactionBuilder.fromXDR(xdr, networkPassphrase)
    const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed

    if (!tx || !Array.isArray(tx.operations)) {
      return null
    }

    const destinations = new Set<string>()
    let asset: string | undefined

    for (const op of tx.operations) {
      if (
        op &&
        typeof op === 'object' &&
        typeof op.type === 'string' &&
        DESTINATION_OPERATION_TYPES.has(op.type) &&
        'destination' in op &&
        typeof op.destination === 'string' &&
        op.destination
      ) {
        destinations.add(op.destination)
        asset = assetLabel(op as unknown as Record<string, unknown>)
      }
    }

    if (destinations.size !== 1) {
      return null
    }

    return { destination: [...destinations][0], asset }
  } catch {
    return null
  }
}
