import type { PointerEvent, RefObject } from 'react'
import type { DirectionKeys } from './car'

interface Props {
  input: RefObject<DirectionKeys>
  onSignal: (side: 'left' | 'right') => void
}

const PAD: { key: keyof DirectionKeys; label: string; text: string }[] = [
  { key: 'up', label: 'Đi lên', text: '▲' },
  { key: 'left', label: 'Sang trái', text: '◀' },
  { key: 'right', label: 'Sang phải', text: '▶' },
  { key: 'down', label: 'Đi xuống', text: '▼' },
]

/**
 * Hold-to-drive direction pad for touch screens, working like the arrow / WASD keys; hidden by CSS when a
 * fine pointer (mouse) is available.
 */
export function TouchControls({ input, onSignal }: Props) {
  function hold(key: keyof DirectionKeys, down: boolean) {
    return (e: PointerEvent<HTMLButtonElement>) => {
      if (down) e.currentTarget.setPointerCapture(e.pointerId)
      input.current[key] = down
    }
  }

  return (
    <div className="sim-touch">
      <div className="sim-dpad">
        {PAD.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`sim-pad sim-pad-${b.key}`}
            aria-label={b.label}
            onPointerDown={hold(b.key, true)}
            onPointerUp={hold(b.key, false)}
            onPointerCancel={hold(b.key, false)}
            onLostPointerCapture={hold(b.key, false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {b.text}
          </button>
        ))}
      </div>
      <div className="sim-touch-group">
        <button type="button" className="sim-pad sim-pad-small" onClick={() => onSignal('left')}>
          Xi nhan trái
        </button>
        <button type="button" className="sim-pad sim-pad-small" onClick={() => onSignal('right')}>
          Xi nhan phải
        </button>
      </div>
    </div>
  )
}
