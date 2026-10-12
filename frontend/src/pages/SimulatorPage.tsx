import { useCallback, useEffect, useRef, useState } from 'react'
import { controlsToward } from '../sim/car'
import { createSim, score, STEP, stepSim, toggleSignal, type Sim, type SimStatus, type ViolationEvent } from '../sim/engine'
import { drawScene, type Viewport } from '../sim/render'
import { PASS_SCORE, VIOLATIONS, type Signal, type ViolationKind } from '../sim/rules'
import { TouchControls } from '../sim/TouchControls'
import { useSimInput } from '../sim/useSimInput'
import { ROUTE } from '../sim/world'

/** What the DOM shows; refreshed from the simulation a few times a second, not every frame. */
interface Hud {
  status: SimStatus
  kmh: number
  limit: number
  score: number
  checkpoint: number
  signal: Signal
  seconds: number
  violations: ViolationEvent[]
  /** Violations still shown as toasts. */
  recent: ViolationEvent[]
}

const HUD_INTERVAL = 100 // ms
const TOAST_SECONDS = 3

function snapshot(sim: Sim): Hud {
  return {
    status: sim.status,
    kmh: Math.round(Math.abs(sim.car.speed) * 3.6),
    limit: sim.rules.limit,
    score: score(sim.violations),
    checkpoint: sim.checkpoint,
    signal: sim.signal,
    seconds: Math.floor(sim.t),
    violations: [...sim.violations],
    recent: sim.violations.filter((v) => sim.t - v.at < TOAST_SECONDS),
  }
}

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

function tally(violations: readonly ViolationEvent[]): [ViolationKind, number][] {
  const counts = new Map<ViolationKind, number>()
  for (const v of violations) counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1)
  return [...counts]
}

/** `/mo-phong`: drive a short route through a small town and get scored like the practical test. */
export function SimulatorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [initialSim] = useState(createSim)
  const simRef = useRef<Sim>(initialSim)
  const [hud, setHud] = useState<Hud>(() => snapshot(initialSim))

  const refreshHud = useCallback(() => setHud(snapshot(simRef.current)), [])

  const setStatus = useCallback(
    (status: SimStatus) => {
      simRef.current.status = status
      refreshHud()
    },
    [refreshHud],
  )

  const togglePause = useCallback(() => {
    const { status } = simRef.current
    if (status === 'running') setStatus('paused')
    else if (status === 'paused') setStatus('running')
  }, [setStatus])

  const signal = useCallback(
    (side: 'left' | 'right') => {
      if (simRef.current.status !== 'running') return
      toggleSignal(simRef.current, side)
      refreshHud()
    },
    [refreshHud],
  )

  const { input, release } = useSimInput({ onSignal: signal, onPause: togglePause })

  function restart() {
    dialogRef.current?.close()
    release()
    simRef.current = createSim()
    setStatus('running')
  }

  // Animation loop: fixed-step physics, one draw per frame, throttled HUD updates.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const view: Viewport = { width: 0, height: 0, dpr: 1 }
    const resize = () => {
      view.dpr = window.devicePixelRatio || 1
      view.width = canvas.clientWidth
      view.height = canvas.clientHeight
      canvas.width = Math.round(view.width * view.dpr)
      canvas.height = Math.round(view.height * view.dpr)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let frame = 0
    let last = performance.now()
    let lastHud = 0
    let pending = 0
    let lastHudKey = ''
    const tick = (now: number) => {
      // Cap the catch-up after a stalled tab so the car doesn't teleport.
      pending += Math.min((now - last) / 1000, 0.1)
      last = now
      const sim = simRef.current
      while (pending >= STEP) {
        // Directions are resolved against the current heading every step, as the car turns toward them.
        stepSim(sim, controlsToward(sim.car, input.current), STEP)
        pending -= STEP
      }
      drawScene(ctx, view, sim)

      if (now - lastHud >= HUD_INTERVAL || sim.status === 'finished') {
        lastHud = now
        const next = snapshot(sim)
        const key = JSON.stringify(next)
        if (key !== lastHudKey) {
          lastHudKey = key
          setHud(next)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [input])

  // Pause when the tab is hidden: the loop stops drawing but the clock shouldn't count it as driving.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && simRef.current.status === 'running') setStatus('paused')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [setStatus])

  useEffect(() => {
    if (hud.status !== 'finished') return
    if (!dialogRef.current?.open) dialogRef.current?.showModal()
  }, [hud.status])

  const target = ROUTE[hud.checkpoint]
  const over = hud.kmh > hud.limit
  const passed = hud.score >= PASS_SCORE

  return (
    <main className="sim">
      <div className="sim-head">
        <h1>Lái xe mô phỏng</h1>
        <div className="sim-actions">
          {(hud.status === 'running' || hud.status === 'paused') && (
            <button type="button" className="btn btn-quiet" onClick={togglePause}>
              {hud.status === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}
            </button>
          )}
          {hud.status !== 'ready' && (
            <button type="button" className="btn btn-quiet" onClick={restart}>
              Lái lại
            </button>
          )}
        </div>
      </div>

      <div className="sim-stage">
        <canvas
          ref={canvasRef}
          className="sim-canvas"
          role="img"
          aria-label="Bản đồ khu phố nhìn từ trên xuống, xe của bạn màu đỏ ở giữa màn hình"
        />

        <div className="sim-hud">
          <div className="sim-gauge">
            <span className={`sim-blinker${hud.signal === 'left' ? ' is-on' : ''}`} aria-hidden="true">
              ◀
            </span>
            <span className={`sim-speed${over ? ' is-over' : ''}`}>
              {hud.kmh}
              <small>km/h</small>
            </span>
            <span className={`sim-blinker${hud.signal === 'right' ? ' is-on' : ''}`} aria-hidden="true">
              ▶
            </span>
            <span className="sim-limit" title="Tốc độ tối đa cho phép">
              {hud.limit}
            </span>
          </div>
          <dl className="sim-stats">
            <div>
              <dt>Điểm</dt>
              <dd className={hud.score < PASS_SCORE ? 'is-failing' : undefined}>{hud.score}</dd>
            </div>
            <div>
              <dt>Điểm đến</dt>
              <dd>
                {Math.min(hud.checkpoint + 1, ROUTE.length)}/{ROUTE.length}
              </dd>
            </div>
            <div>
              <dt>Thời gian</dt>
              <dd>{formatTime(hud.seconds)}</dd>
            </div>
          </dl>
          {target && <p className="sim-hint">{target.hint}</p>}
        </div>

        <ul className="sim-toasts" aria-live="polite">
          {hud.recent.map((v) => (
            <li key={`${v.kind}-${v.at}`}>
              <strong>−{VIOLATIONS[v.kind].points}</strong> {VIOLATIONS[v.kind].label}
            </li>
          ))}
        </ul>

        {hud.status === 'ready' && (
          <div className="sim-overlay">
            <div className="sim-card">
              <h2>Lái thử trên sa hình</h2>
              <p>
                Lái qua {ROUTE.length} điểm đến (vòng tròn xanh có số) theo mũi tên và bản đồ nhỏ. Bạn có 100 điểm, mỗi lỗi
                bị trừ điểm; cần từ {PASS_SCORE} điểm trở lên để đạt.
              </p>
              <ul className="sim-keys">
                <li>
                  <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> hoặc <kbd>W</kbd> <kbd>S</kbd> <kbd>A</kbd> <kbd>D</kbd>:
                  đi theo hướng trên màn hình. Cùng hướng đầu xe là tiến, ngược hướng là lùi, sang ngang là xe quẹo dần
                  về phía đó
                </li>
                <li>
                  <kbd>Q</kbd> / <kbd>E</kbd> xi nhan trái / phải · <kbd>P</kbd> tạm dừng
                </li>
              </ul>
              <ul className="sim-rules">
                {Object.values(VIOLATIONS).map((v) => (
                  <li key={v.label}>
                    {v.label} <span>−{v.points}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setStatus('running')}>
                Bắt đầu
              </button>
            </div>
          </div>
        )}
        {hud.status === 'paused' && (
          <div className="sim-overlay">
            <div className="sim-card">
              <h2>Đang tạm dừng</h2>
              <button type="button" className="btn btn-primary btn-block" onClick={togglePause}>
                Tiếp tục
              </button>
            </div>
          </div>
        )}

        {hud.status === 'running' && <TouchControls input={input} onSignal={signal} />}
      </div>

      <p className="sim-note muted">
        Đi bên phải đường, bật xi nhan trước khi rẽ, dừng hẳn trước vạch ở biển STOP và đi đúng tốc độ trên biển báo.
      </p>

      <dialog ref={dialogRef} className="confirm sim-result" aria-labelledby="sim-result-title">
        <h2 id="sim-result-title" className={passed ? 'is-pass' : 'is-fail'}>
          {passed ? 'Đạt' : 'Chưa đạt'}: {hud.score}/100 điểm
        </h2>
        <p>
          Hoàn thành {ROUTE.length} điểm đến trong {formatTime(hud.seconds)}. Cần từ {PASS_SCORE} điểm để đạt.
        </p>
        {hud.violations.length === 0 ? (
          <p>Không mắc lỗi nào. Tuyệt vời!</p>
        ) : (
          <ul className="sim-rules">
            {tally(hud.violations).map(([kind, count]) => (
              <li key={kind}>
                {VIOLATIONS[kind].label} ×{count} <span>−{VIOLATIONS[kind].points * count}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="confirm-actions">
          <button type="button" className="btn btn-quiet" onClick={() => dialogRef.current?.close()}>
            Đóng
          </button>
          <button type="button" className="btn btn-primary" onClick={restart}>
            Lái lại
          </button>
        </div>
      </dialog>
    </main>
  )
}
