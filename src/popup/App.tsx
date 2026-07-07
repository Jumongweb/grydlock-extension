import { useEffect, useState } from 'react'
import { getScore } from '../adapter/oracleAdapter'
import { tierForScore } from '../lib/tiers'
import DevScoreSlider from './DevScoreSlider'
import './App.css'

const PLACEHOLDER_DESTINATION = 'GABCDEXAMPLE0000000000000000000000000000000000000000000'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; score: number }

export default function App() {
  const [attempt, setAttempt] = useState(0)
  return <ScoreView key={attempt} onRetry={() => setAttempt((n) => n + 1)} />
}

function ScoreView({ onRetry }: { onRetry: () => void }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [devOverride, setDevOverride] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getScore(PLACEHOLDER_DESTINATION)
      .then((score) => {
        if (!cancelled) setState({ status: 'ready', score })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return <div className="popup">Checking destination…</div>
  }

  if (state.status === 'error') {
    return (
      <div className="popup">
        <p className="message">Could not reach the risk oracle.</p>
        <button className="proceed" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }

  const displayScore = devOverride ?? state.score
  const tier = tierForScore(displayScore)

  return (
    <div className="popup" style={{ borderTop: `4px solid ${tier.colour}` }}>
      <h1>{tier.label} risk</h1>
      <p className="score">Score: {displayScore}</p>
      <p className="message">{tier.message}</p>
      <div className="actions">
        <button className="cancel" onClick={() => window.close()}>
          Cancel
        </button>
        <button className="proceed" onClick={() => window.close()}>
          Proceed
        </button>
      </div>
      {import.meta.env.DEV && <DevScoreSlider score={displayScore} onChange={setDevOverride} />}
    </div>
  )
}
