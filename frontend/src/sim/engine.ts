import { carCorners, stepCar, type CarState, type Controls } from './car'
import { RuleChecker, VIOLATIONS, type Signal, type ViolationKind } from './rules'
import { onRoad, ROUTE, START } from './world'

export type SimStatus = 'ready' | 'running' | 'paused' | 'finished'

export interface ViolationEvent {
  kind: ViolationKind
  /** Simulation time in seconds. */
  at: number
}

/** Mutable simulation state, owned by the animation loop (not React state). */
export interface Sim {
  status: SimStatus
  t: number
  car: CarState
  braking: boolean
  signal: Signal
  rules: RuleChecker
  violations: ViolationEvent[]
  /** Index of the next checkpoint in ROUTE; equals ROUTE.length once the route is done. */
  checkpoint: number
}

/** Fixed physics step, so behaviour doesn't depend on the display's frame rate. */
export const STEP = 1 / 60
const CHECKPOINT_RADIUS = 6

export function createSim(): Sim {
  return {
    status: 'ready',
    t: 0,
    car: { x: START.position.x, y: START.position.y, heading: START.heading, speed: 0, steer: 0 },
    braking: false,
    signal: null,
    rules: new RuleChecker(),
    violations: [],
    checkpoint: 0,
  }
}

export function stepSim(sim: Sim, controls: Controls, dt: number): void {
  if (sim.status !== 'running') return
  sim.t += dt

  const next = stepCar(sim.car, controls, dt)
  const hitKerb = carCorners(next).some((corner) => !onRoad(corner))
  // A kerb stops the car dead; it can back or steer away from where it was.
  sim.car = hitKerb ? { ...sim.car, speed: 0, steer: next.steer } : next
  sim.braking = controls.brake && sim.car.speed > 0.1

  const { violations, turned } = sim.rules.update(sim.car, sim.signal, sim.t, hitKerb)
  for (const kind of violations) sim.violations.push({ kind, at: sim.t })
  if (turned) sim.signal = null // indicators self-cancel after the turn, as in a real car

  const target = ROUTE[sim.checkpoint]
  if (target && Math.hypot(sim.car.x - target.position.x, sim.car.y - target.position.y) <= CHECKPOINT_RADIUS) {
    sim.checkpoint += 1
    if (sim.checkpoint === ROUTE.length) sim.status = 'finished'
  }
}

export function toggleSignal(sim: Sim, side: 'left' | 'right'): void {
  sim.signal = sim.signal === side ? null : side
}

export function score(violations: readonly ViolationEvent[]): number {
  return Math.max(0, 100 - violations.reduce((sum, v) => sum + VIOLATIONS[v.kind].points, 0))
}
