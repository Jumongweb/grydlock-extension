export type Tier = 'low' | 'elevated' | 'high' | 'critical'

export interface TierInfo {
  tier: Tier
  label: string
  colour: string
  message: string
}

const TIERS: Array<{ max: number; info: TierInfo }> = [
  {
    max: 20,
    info: {
      tier: 'low',
      label: 'Low',
      colour: '#2e7d32',
      message: 'No signs of a risky destination.',
    },
  },
  {
    max: 50,
    info: {
      tier: 'elevated',
      label: 'Elevated',
      colour: '#f9a825',
      message: 'Some unusual signals — double-check the destination.',
    },
  },
  {
    max: 75,
    info: {
      tier: 'high',
      label: 'High',
      colour: '#ef6c00',
      message: 'Strong indicators of risk. Confirm you trust this destination.',
    },
  },
  {
    max: 100,
    info: {
      tier: 'critical',
      label: 'Critical',
      colour: '#c62828',
      message: 'This destination looks fraudulent. Cancelling is strongly recommended.',
    },
  },
]

export function tierForScore(score: number): TierInfo {
  const clamped = Math.max(0, Math.min(100, score))
  const match = TIERS.find(({ max }) => clamped <= max)
  return match!.info
}
