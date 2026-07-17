// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { extractDestination } from './decodeTransaction'

const SOURCE = Keypair.random().publicKey()
const DEST_A = Keypair.random().publicKey()
const DEST_B = Keypair.random().publicKey()
const ISSUER = Keypair.random().publicKey()

function buildXdr(operations: ReturnType<typeof Operation.payment>[]) {
  const account = new Account(SOURCE, '0')
  const builder = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
  for (const op of operations) builder.addOperation(op)
  return builder.setTimeout(30).build().toXDR()
}

describe('extractDestination', () => {
  it('extracts the destination from a single native payment', () => {
    const xdr = buildXdr([Operation.payment({ destination: DEST_A, asset: Asset.native(), amount: '10' })])
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({ kind: 'payment', destination: DEST_A, asset: undefined })
  })

  it('extracts destination and asset label from a non-native payment', () => {
    const credit = new Asset('USD', ISSUER)
    const xdr = buildXdr([Operation.payment({ destination: DEST_A, asset: credit, amount: '10' })])
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({
      kind: 'payment',
      destination: DEST_A,
      asset: `USD:${ISSUER}`,
    })
  })

  it('extracts the destination from a path payment', () => {
    const xdr = buildXdr([
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: '10',
        destination: DEST_A,
        destAsset: Asset.native(),
        destMin: '1',
        path: [],
      }),
    ])
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({ kind: 'payment', destination: DEST_A, asset: undefined })
  })

  it('returns null when operations target more than one destination', () => {
    const xdr = buildXdr([
      Operation.payment({ destination: DEST_A, asset: Asset.native(), amount: '10' }),
      Operation.payment({ destination: DEST_B, asset: Asset.native(), amount: '5' }),
    ])
    expect(extractDestination(xdr, Networks.TESTNET)).toBeNull()
  })

  it('resolves a single destination when repeated across operations', () => {
    const xdr = buildXdr([
      Operation.payment({ destination: DEST_A, asset: Asset.native(), amount: '10' }),
      Operation.payment({ destination: DEST_A, asset: Asset.native(), amount: '5' }),
    ])
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({ kind: 'payment', destination: DEST_A, asset: undefined })
  })

  it('returns null for operations with no destination (e.g. manageData)', () => {
    const xdr = buildXdr([Operation.manageData({ name: 'note', value: 'hi' })])
    expect(extractDestination(xdr, Networks.TESTNET)).toBeNull()
  })

  it('returns null for malformed XDR instead of throwing', () => {
    expect(extractDestination('not-valid-xdr', Networks.TESTNET)).toBeNull()
  })

  it('extracts contract address and function from a single invokeHostFunction invokeContract', () => {
    const fakeTx = {
      operations: [
        {
          type: 'invokeHostFunction',
          hostFunction: {
            functions: [
              {
                type: 'invokeContract',
                invokeContract: {
                  contractAddress: DEST_A,
                  functionName: 'transfer',
                  args: [],
                },
              },
            ],
          },
        },
      ],
    }
    expect(
      extractDestination('_ignored_xdr_', Networks.TESTNET, () => fakeTx),
    ).toEqual({
      kind: 'contractInvocation',
      destination: DEST_A,
      function: 'transfer',
    })
  })

  it('returns null when no payment or contract destination is present', () => {
    const fakeTx = {
      operations: [
        {
          type: 'invokeHostFunction',
          hostFunction: {
            functions: [
              { type: 'uploadContractWasm', uploadContractWasm: { wasm: Buffer.from('abc') } },
            ],
          },
        },
      ],
    }
    expect(
      extractDestination('_ignored_xdr_', Networks.TESTNET, () => fakeTx),
    ).toBeNull()
  })

  it('returns null when invokeContract lacks contractAddress', () => {
    const fakeTx = {
      operations: [
        {
          type: 'invokeHostFunction',
          hostFunction: {
            functions: [
              {
                type: 'invokeContract',
                invokeContract: {
                  functionName: 'transfer',
                  args: [],
                },
              },
            ],
          },
        },
      ],
    }
    expect(
      extractDestination('_ignored_xdr_', Networks.TESTNET, () => fakeTx),
    ).toBeNull()
  })

  it('returns null when multiple distinct contract destinations appear', () => {
    const fakeTx = {
      operations: [
        {
          type: 'invokeHostFunction',
          hostFunction: {
            functions: [
              {
                type: 'invokeContract',
                invokeContract: { contractAddress: DEST_A, functionName: 'transfer', args: [] },
              },
            ],
          },
        },
        {
          type: 'invokeHostFunction',
          hostFunction: {
            functions: [
              {
                type: 'invokeContract',
                invokeContract: { contractAddress: DEST_B, functionName: 'approve', args: [] },
              },
            ],
          },
        },
      ],
    }
    expect(
      extractDestination('_ignored_xdr_', Networks.TESTNET, () => fakeTx),
    ).toBeNull()
  })
})
