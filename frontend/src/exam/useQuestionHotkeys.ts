import { useEffect, useRef } from 'react'

interface Options {
  /** Return true to ignore key presses (e.g. while a dialog is open or a request is in flight). */
  isBlocked?: () => boolean
  onPrev: () => void
  onNext: () => void
  /** Return true if the digit matched an option and was handled. */
  onPick: (position: number) => boolean
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && target.getAttribute('type') !== 'radio')
  )
}

/** Keyboard: 1-4 chooses an answer, arrow keys move between questions. */
export function useQuestionHotkeys(options: Options): void {
  // Keep the latest callbacks without re-subscribing on every render.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const { isBlocked, onPrev, onNext, onPick } = optionsRef.current
      if (e.altKey || e.ctrlKey || e.metaKey || isBlocked?.() || isTypingTarget(e.target)) return
      if (e.key === 'ArrowRight') onNext()
      else if (e.key === 'ArrowLeft') onPrev()
      else if (!onPick(Number(e.key))) return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
