export type Tier = 'low' | 'elevated' | 'high' | 'critical'

export interface TierInfo {
  tier: Tier
  label: string
  /** Hex colour used for visual accents (border, badge).
   *  All values meet WCAG 2.1 AA contrast (≥ 4.5:1) against white (#ffffff). */
  colour: string
  /** Unicode icon that conveys tier without relying on colour alone. */
  icon: string
  message: string
}

const TIERS: Array<{ max: number; info: TierInfo }> = [
  {
    max: 20,
    info: {
      tier: 'low',
      label: 'Low',
      colour: '#2e7d32', // 5.13:1 on white — WCAG AA ✓
      icon: '✓',
      message: 'No signs of a risky destination.',
    },
  },
  {
    max: 50,
    info: {
      tier: 'elevated',
      label: 'Elevated',
      colour: '#a86300', // 4.72:1 on white — WCAG AA ✓  (was #f9a825 @ 1.97:1 — FAIL)
      icon: '⚠',
      message: 'Some unusual signals — double-check the destination.',
    },
  },
  {
    max: 75,
    info: {
      tier: 'high',
      label: 'High',
      colour: '#bf360c', // 5.60:1 on white — WCAG AA ✓  (was #ef6c00 @ 3.08:1 — FAIL)
      icon: '⚠',
      message: 'Strong indicators of risk. Confirm you trust this destination.',
    },
  },
  {
    max: 100,
    info: {
      tier: 'critical',
      label: 'Critical',
      colour: '#c62828', // 5.62:1 on white — WCAG AA ✓
      icon: '✕',
      message: 'This destination looks fraudulent. Cancelling is strongly recommended.',
    },
  },
]

export function tierForScore(score: number): TierInfo {
  const clamped = Math.max(0, Math.min(100, score))
  const match = TIERS.find(({ max }) => clamped <= max)
  return match!.info
}
