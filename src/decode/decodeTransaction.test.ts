// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { DecodedDestination, extractDestination } from './decodeTransaction'

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
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({ destination: DEST_A, asset: undefined })
  })

  it('extracts destination and asset label from a non-native payment', () => {
    const credit = new Asset('USD', ISSUER)
    const xdr = buildXdr([Operation.payment({ destination: DEST_A, asset: credit, amount: '10' })])
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({
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
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({ destination: DEST_A, asset: undefined })
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
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({ destination: DEST_A, asset: undefined })
  })

  it('returns null for operations with no destination (e.g. manageData)', () => {
    const xdr = buildXdr([Operation.manageData({ name: 'note', value: 'hi' })])
    expect(extractDestination(xdr, Networks.TESTNET)).toBeNull()
  })

  it('returns null for malformed XDR instead of throwing', () => {
    expect(extractDestination('not-valid-xdr', Networks.TESTNET)).toBeNull()
  })

  it('handles transactions with extreme operation counts (e.g. 50 operations)', () => {
    const ops = Array.from({ length: 50 }, () =>
      Operation.payment({ destination: DEST_A, asset: Asset.native(), amount: '1' }),
    )
    const xdr = buildXdr(ops)
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({ destination: DEST_A, asset: undefined })
  })

  it('handles deeply nested path payments with many path assets', () => {
    const path = Array.from({ length: 5 }, () => new Asset('OPT', ISSUER))
    const xdr = buildXdr([
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: '100',
        destination: DEST_A,
        destAsset: new Asset('USD', ISSUER),
        destMin: '1',
        path,
      }),
    ])
    expect(extractDestination(xdr, Networks.TESTNET)).toEqual({
      destination: DEST_A,
      asset: `USD:${ISSUER}`,
    })
  })

  describe('property-based fuzzing & defensive resilience', () => {
    it('never throws on arbitrary random strings', () => {
      fc.assert(
        fc.property(fc.string(), (randomStr) => {
          expect(() => extractDestination(randomStr)).not.toThrow()
          expect(extractDestination(randomStr)).toBeNull()
        }),
        { numRuns: 100 },
      )
    })

    it('never throws on arbitrary base64/binary payloads', () => {
      fc.assert(
        fc.property(fc.base64String(), (base64Payload) => {
          expect(() => extractDestination(base64Payload)).not.toThrow()
        }),
        { numRuns: 100 },
      )
    })

    it('never throws and correctly identifies single vs multiple destinations on generated valid transactions', () => {
      const validPubkeyArb = fc
        .uint8Array({ minLength: 32, maxLength: 32 })
        .map((seed) => Keypair.fromRawEd25519Seed(Buffer.from(seed)).publicKey())

      const assetArb = fc.oneof(
        fc.constant(Asset.native()),
        fc.tuple(fc.stringMatching(/^[A-Za-z0-9]{1,12}$/), validPubkeyArb).map(([code, issuer]) => new Asset(code, issuer)),
      )

      type TestOp = {
        dest: string | null
        op: ReturnType<typeof Operation.payment>
      }

      const opArb: fc.Arbitrary<TestOp> = fc.oneof(
        // payment
        fc.tuple(validPubkeyArb, assetArb, fc.integer({ min: 1, max: 1000000 })).map(([dest, asset, amount]) => ({
          dest,
          op: Operation.payment({ destination: dest, asset, amount: amount.toString() }),
        })),
        // pathPaymentStrictSend
        fc
          .tuple(
            validPubkeyArb,
            assetArb,
            assetArb,
            fc.array(assetArb, { maxLength: 5 }),
            fc.integer({ min: 1, max: 1000000 }),
          )
          .map(([dest, sendAsset, destAsset, path, amount]) => ({
            dest,
            op: Operation.pathPaymentStrictSend({
              destination: dest,
              sendAsset,
              sendAmount: amount.toString(),
              destAsset,
              destMin: '1',
              path,
            }),
          })),
        // pathPaymentStrictReceive
        fc
          .tuple(
            validPubkeyArb,
            assetArb,
            assetArb,
            fc.array(assetArb, { maxLength: 5 }),
            fc.integer({ min: 1, max: 1000000 }),
          )
          .map(([dest, sendAsset, destAsset, path, amount]) => ({
            dest,
            op: Operation.pathPaymentStrictReceive({
              destination: dest,
              sendAsset,
              sendMax: '1000000',
              destAsset,
              destAmount: amount.toString(),
              path,
            }),
          })),
        // createAccount
        fc
          .tuple(validPubkeyArb, fc.integer({ min: 1, max: 1000000 }))
          .map(([dest, amount]) => ({
            dest,
            op: Operation.createAccount({ destination: dest, startingBalance: amount.toString() }),
          })),
        // manageData (non-destination op)
        fc
          .stringMatching(/^[a-zA-Z0-9_]{1,16}$/)
          .map((name) => ({
            dest: null,
            op: Operation.manageData({ name, value: 'data' }),
          })),
      )

      fc.assert(
        fc.property(
          fc.array(opArb, { minLength: 1, maxLength: 25 }),
          (testOps) => {
            const xdr = buildXdr(testOps.map((t) => t.op))
            let result: DecodedDestination | null = null
            expect(() => {
              result = extractDestination(xdr, Networks.TESTNET)
            }).not.toThrow()

            const expectedDests = new Set<string>()
            for (const t of testOps) {
              if (t.dest) {
                expectedDests.add(t.dest)
              }
            }

            if (expectedDests.size === 1) {
              const res = result as DecodedDestination | null
              expect(res).not.toBeNull()
              expect(res?.destination).toBe([...expectedDests][0])
            } else {
              expect(result).toBeNull()
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
