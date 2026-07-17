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

// Soroban hostFunction shapes that can carry a contractAddress we want to score
const INVOKE_CONTRACT_TYPES = new Set(['invokeContract'])

function assetLabel(op: Record<string, unknown>): string | undefined {
  const asset = (op.asset ?? op.destAsset) as Asset | undefined
  if (!asset || asset.isNative()) return undefined
  return `${asset.getCode()}:${asset.getIssuer()}`
}

function hostFunctionLabel(op: Record<string, unknown>): string | undefined {
  const hf = op.hostFunction as Record<string, unknown> | undefined
  if (!hf || typeof hf !== 'object') return undefined
  const functions = (hf as any).functions as Record<string, unknown>[] | undefined
  if (!functions || !Array.isArray(functions)) return undefined
  const fn = functions.find((f) => typeof f === 'object' && f.type === 'invokeContract')
  if (!fn || typeof fn !== 'object') return undefined
  const ic = (fn as any).invokeContract as Record<string, unknown> | undefined
  if (!ic || typeof ic !== 'object') return undefined
  if (typeof ic.contractAddress === 'string' && typeof ic.functionName === 'string') {
    return ic.functionName
  }
  return undefined
}

function isInvokeContractHostFunction(op: Record<string, unknown>): boolean {
  const hf = op.hostFunction as Record<string, unknown> | undefined
  if (!hf || typeof hf !== 'object') return false
  const functions = (hf as any).functions as Record<string, unknown>[] | undefined
  if (!functions || !Array.isArray(functions)) return false
  return functions.some(
    (f) => typeof f === 'object' && f.type === 'invokeContract',
  )
}

function hostFunctionContractAddress(op: Record<string, unknown>): string | undefined {
  const hf = op.hostFunction as Record<string, unknown> | undefined
  if (!hf || typeof hf !== 'object') return undefined
  const functions = (hf as any).functions as Record<string, unknown>[] | undefined
  if (!functions || !Array.isArray(functions)) return undefined
  const fn = functions.find((f) => typeof f === 'object' && f.type === 'invokeContract')
  if (!fn || typeof fn !== 'object') return undefined
  const ic = (fn as any).invokeContract as Record<string, unknown> | undefined
  if (!ic || typeof ic !== 'object') return undefined
  if (typeof ic.contractAddress === 'string') {
    return ic.contractAddress
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
  const destinations = new Set<string>()
  const kinds = new Set<'payment' | 'contractInvocation'>()
  let asset: string | undefined
  let functionName: string | undefined

  for (const op of tx.operations) {
    if (DESTINATION_OPERATION_TYPES.has(op.type) && 'destination' in op && op.destination) {
      destinations.add(op.destination as string)
      kinds.add('payment')
      asset = assetLabel(op as unknown as Record<string, unknown>)
    } else if (op.type === 'invokeHostFunction') {
      const raw = op as unknown as Record<string, unknown>
      if (isInvokeContractHostFunction(raw)) {
        const address = hostFunctionContractAddress(raw)
        if (address) {
          destinations.add(address)
          kinds.add('contractInvocation')
          functionName = hostFunctionLabel(raw)
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
