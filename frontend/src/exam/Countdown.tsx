import { formatClock } from '../lib/format'

const WARNING_SECONDS = 120
const DANGER_SECONDS = 30

/** Styled after the countdown displays on Vietnamese traffic lights: green, then amber, then red. */
export function Countdown({ secondsLeft }: { secondsLeft: number }) {
  const phase = secondsLeft <= DANGER_SECONDS ? 'danger' : secondsLeft <= WARNING_SECONDS ? 'warning' : 'go'
  const whole = Math.ceil(secondsLeft)
  // Announce only at meaningful moments, not every second.
  const announce = whole === WARNING_SECONDS || whole === DANGER_SECONDS ? `Còn ${formatClock(whole)}` : ''

  return (
    <div className={`countdown is-${phase}`}>
      <span className="countdown-label">Thời gian còn lại</span>
      <span className="countdown-digits" aria-hidden="true">
        {formatClock(secondsLeft)}
      </span>
      <span className="visually-hidden" aria-live="polite">
        {announce}
      </span>
    </div>
  )
}
