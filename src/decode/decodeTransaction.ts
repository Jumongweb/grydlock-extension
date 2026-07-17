import { Asset, FeeBumpTransaction, Networks, TransactionBuilder } from '@stellar/stellar-sdk'

export type DecodedDestination =
  | { kind: 'payment'; destination: string; asset?: string }
  | { kind: 'contractInvocation'; destination: string; function?: string }

const DESTINATION_OPERATION_TYPES = new Set([
  'payment',
  'pathPaymentStrictSend',
  'pathPaymentStrictReceive',
  'createAccount',
])

function assetLabel(op: Record<string, unknown>): string | undefined {
  const asset = (op.asset ?? op.destAsset) as Asset | undefined
  if (!asset || asset.isNative()) return undefined
  return `${asset.getCode()}:${asset.getIssuer()}`
}

function hostFunctionFunctionName(hostFunction: unknown): string | undefined {
  if (!hostFunction || typeof hostFunction !== 'object') return undefined
  const functions = (hostFunction as Record<string, unknown>).functions as
    | Array<{ type: string; invokeContract?: { functionName?: string } }>
    | undefined
  if (!functions || !Array.isArray(functions)) return undefined
  const fn = functions.find((f) => f.type === 'invokeContract')
  if (!fn) return undefined
  return typeof fn.invokeContract?.functionName === 'string'
    ? fn.invokeContract.functionName
    : undefined
}

function isInvokeContractHostFunction(op: Record<string, unknown>): boolean {
  const hostFunction = op.hostFunction as unknown
  if (!hostFunction || typeof hostFunction !== 'object') return false
  const functions = (hostFunction as Record<string, unknown>).functions as
    | { type: string }[]
    | undefined
  if (!functions || !Array.isArray(functions)) return false
  return functions.some((f) => f.type === 'invokeContract')
}

function hostFunctionContractAddress(op: Record<string, unknown>): string | undefined {
  const hostFunction = op.hostFunction as unknown
  if (!hostFunction || typeof hostFunction !== 'object') return undefined
  const functions = (hostFunction as Record<string, unknown>).functions as
    | { type: string; invokeContract?: { contractAddress?: string } }[]
    | undefined
  if (!functions || !Array.isArray(functions)) return undefined
  const fn = functions.find((f) => f.type === 'invokeContract')
  if (!fn) return undefined
  if (typeof fn.invokeContract?.contractAddress === 'string') {
    return fn.invokeContract.contractAddress
  }
  return undefined
}

export function extractDestination(
  xdr: string,
  networkPassphrase: string = Networks.TESTNET,
): DecodedDestination | null {
  let parsed
  try {
    parsed = TransactionBuilder.fromXDR(xdr, networkPassphrase)
  } catch {
    return null
  }

  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed
  return extractDecodedDestination(tx)
}

export function extractDecodedDestination(
  rawTx: unknown,
): DecodedDestination | null {
  const tx = rawTx as Record<string, unknown>
  const operations = (tx.operations as unknown[]) || []
  const destinations = new Set<string>()
  const kinds = new Set<'payment' | 'contractInvocation'>()
  let asset: string | undefined
  let functionName: string | undefined

  for (const op of operations) {
    const rawOp = op as Record<string, unknown>
    const opType = typeof rawOp.type === 'string' ? rawOp.type : ''
    if (DESTINATION_OPERATION_TYPES.has(opType) && 'destination' in rawOp && rawOp.destination) {
      destinations.add(typeof rawOp.destination === 'string' ? rawOp.destination : ('' as never))
      kinds.add('payment')
      asset = assetLabel(rawOp)
    } else if (opType === 'invokeHostFunction') {
      if (isInvokeContractHostFunction(rawOp)) {
        const address = hostFunctionContractAddress(rawOp)
        if (address) {
          destinations.add(address)
          kinds.add('contractInvocation')
          functionName = hostFunctionFunctionName(rawOp.hostFunction as unknown)
        }
      }
    }
  }

  if (destinations.size !== 1 || kinds.size !== 1) {
    return null
  }

  if (kinds.has('payment')) {
    return { kind: 'payment', destination: [...destinations][0], asset }
  }

  return { kind: 'contractInvocation', destination: [...destinations][0], function: functionName }
}
