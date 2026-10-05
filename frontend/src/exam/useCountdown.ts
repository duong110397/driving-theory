import { useEffect, useRef, useState } from 'react'

/**
 * Seconds left until a deadline given as "seconds remaining" from the server, using the monotonic
 * clock so changing the device time has no effect. `onExpire` fires once when it reaches zero.
 */
export function useCountdown(remainingSeconds: number, onExpire: () => void): number {
  const [left, setLeft] = useState(remainingSeconds)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    const deadline = performance.now() + remainingSeconds * 1000
    let expired = false
    const tick = () => {
      const next = Math.max(0, (deadline - performance.now()) / 1000)
      setLeft(next)
      if (next <= 0 && !expired) {
        expired = true
        window.clearInterval(id)
        onExpireRef.current()
      }
    }
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [remainingSeconds])

  return left
}
