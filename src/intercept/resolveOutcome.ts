import type { Decision, Outcome, RuntimeSignRequestInfo } from './protocol'
import type { DecodedDestination } from '../decode/decodeTransaction'

export interface ResolveOutcomeDeps {
  extractDestination: (xdr: string) => DecodedDestination | null
  getScore: (destination: string) => Promise<number>
  requestDecision: (info: RuntimeSignRequestInfo) => Promise<Decision>
}

/**
 * Decides what should happen to a pending signTransaction call: 'allow' when
 * no single destination can be determined (nothing to warn about — Gryd Lock
 * never blocks what it can't assess), otherwise scores the destination and
 * defers to the user's proceed/cancel decision.
 */
export async function resolveOutcome(xdr: string, deps: ResolveOutcomeDeps): Promise<Outcome> {
  const decoded = deps.extractDestination(xdr)
  if (!decoded) return 'allow'

  const score = await deps.getScore(decoded.destination)
  return deps.requestDecision({
    destination: decoded.destination,
    kind: decoded.kind,
    asset: decoded.kind === 'payment' ? decoded.asset : undefined,
    function: decoded.kind === 'contractInvocation' ? decoded.function : undefined,
    score,
  })
}
