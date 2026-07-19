import { addTrustedAddress } from '../utils/storageHelper';
import type { CSSProperties, ReactNode } from 'react';
import { useRef } from 'react';
import type { TierInfo } from '../lib/tiers';

interface TierWarningProps {
  tier: TierInfo;
  score: number;
  destination?: string;
  onCancel: () => void;
  onProceed: () => void;
  devControl?: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export default function TierWarning({
  tier,
  score,
  destination,
  onCancel,
  onProceed,
  devControl,
}: TierWarningProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const describedByIds = [
    destination ? 'tier-warning-destination' : null,
    'tier-warning-score',
    'tier-warning-message',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="popup"
      data-tier={tier.tier}
      aria-describedby={describedByIds}
      style={{
        '--tier-accent-light': tier.colour,
        '--tier-accent-dark': tier.darkColour,
      } as CSSProperties}
    >
      <h1 id="tier-warning-title" aria-live="assertive">
        <span className="tier-icon" aria-hidden="true">
          {tier.icon}
        </span>{' '}
        {tier.label} risk
      </h1>
      {destination && (
        <p id="tier-warning-destination" className="destination">
          {destination}
        </p>
      )}
      <p id="tier-warning-score" className="score">
        Score: {score}
      </p>
      <p id="tier-warning-message" className="message">
        {tier.message}
      </p>
      <div className="actions">
        <button className="cancel" onClick={onCancel} ref={cancelRef}>
          Cancel
        </button>
        {destination && (tier.tier === 'low' || tier.tier === 'elevated') && (
          <button className="trust" onClick={() => addTrustedAddress(destination)}>
            Trust this destination
          </button>
        )}
        <button className="proceed" onClick={onProceed}>
          Proceed
        </button>
      </div>
      {devControl}
    </div>
  );
}
