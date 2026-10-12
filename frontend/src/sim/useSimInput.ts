import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { isTypingTarget } from '../exam/useQuestionHotkeys'
import type { DirectionKeys } from './car'

// By `KeyboardEvent.code`, so WASD sits in the same place on any keyboard layout.
const DIRECTION_KEYS: Readonly<Record<string, keyof DirectionKeys>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

interface Actions {
  onSignal: (side: 'left' | 'right') => void
  onPause: () => void
}

const released = (): DirectionKeys => ({ up: false, down: false, left: false, right: false })

/**
 * Keyboard driving: arrows or W/A/S/D point the way to go on screen (see `controlsToward`), Q / E
 * toggle the indicators, P or Esc pauses. Returns the held directions, which on-screen touch buttons
 * may also write to, and `release` to let go of everything at once.
 */
export function useSimInput(actions: Actions): { input: RefObject<DirectionKeys>; release: () => void } {
  const input = useRef<DirectionKeys>(released())
  const release = useCallback(() => {
    input.current = released()
  }, [])
  // Keep the latest callbacks without re-subscribing on every render.
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  })

  useEffect(() => {
    function hold(e: KeyboardEvent, down: boolean): boolean {
      const direction = DIRECTION_KEYS[e.code]
      if (direction) input.current[direction] = down
      return Boolean(direction)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      if (hold(e, true)) {
        e.preventDefault() // arrows would scroll the page
        return
      }
      if (e.repeat) return
      if (e.code === 'KeyQ') actionsRef.current.onSignal('left')
      else if (e.code === 'KeyE') actionsRef.current.onSignal('right')
      else if (e.code === 'KeyP' || e.code === 'Escape') actionsRef.current.onPause()
    }
    function onKeyUp(e: KeyboardEvent) {
      hold(e, false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    // A key released while the window is unfocused never sends keyup; don't leave the throttle stuck.
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
    }
  }, [release])

  return { input, release }
}
