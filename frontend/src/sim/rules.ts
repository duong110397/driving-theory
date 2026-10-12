import type { CarState } from './car'
import { BLOCK, frame, lightState, locate, wrapAngle, ZONE, type Axis, type Dir, type Junction, type Segment } from './world'

export type Signal = 'left' | 'right' | null

export type ViolationKind = 'red_light' | 'stop_sign' | 'no_signal' | 'wrong_lane' | 'speeding' | 'kerb'

/** Deductions out of 100, modelled on the practical-test scoring (sa hình). */
export const VIOLATIONS: Readonly<Record<ViolationKind, { label: string; points: number }>> = {
  red_light: { label: 'Vượt đèn đỏ', points: 10 },
  stop_sign: { label: 'Không dừng hẳn tại biển STOP', points: 5 },
  no_signal: { label: 'Chuyển hướng không bật xi nhan', points: 5 },
  wrong_lane: { label: 'Đi sang làn ngược chiều', points: 5 },
  speeding: { label: 'Chạy quá tốc độ cho phép', points: 5 },
  kerb: { label: 'Xe va chạm vỉa hè', points: 5 },
}

export const PASS_SCORE = 80

/** Leaving the centre line by this much counts as being in the opposite lane (the car is 1.8 m wide). */
const WRONG_LANE_MARGIN = 0.3
const WRONG_LANE_GRACE = 1 // s, so a brief swerve around the centre line isn't punished
const SPEED_TOLERANCE = 3 // km/h
const SPEEDING_GRACE = 2 // s
/** A full stop counts for a stop sign when made within this distance before the stop line. */
const STOP_DISTANCE = 15
const STOPPED_SPEED = 0.3 // m/s
const KERB_COOLDOWN = 2 // s, one scrape is one violation
const TURN_THRESHOLD = Math.PI / 4
/** Signals count while the car is still pointing roughly the way it entered. */
const SIGNAL_WINDOW = Math.PI / 9

interface JunctionVisit {
  junction: Junction
  entryHeading: number
  signals: Set<'left' | 'right'>
}

/** Heading-based travel direction along a segment's axis. */
function directionAlong(axis: Axis, heading: number): Dir {
  return (axis === 'ew' ? Math.cos(heading) : Math.sin(heading)) >= 0 ? 1 : -1
}

/**
 * Watches the car and reports each violation once per occurrence. Stateful (junction visits,
 * grace timers), so a fresh checker goes with each attempt.
 */
export class RuleChecker {
  /** Speed limit of the last segment driven on, in km/h. */
  limit = 50
  private visit: JunctionVisit | null = null
  private lastAxis: Axis = 'ew'
  private stoppedAt: string | null = null
  private wrongLaneSince: number | null = null
  private wrongLaneReported = false
  private speedingSince: number | null = null
  private speedingReported = false
  private kerbCooldownUntil = 0

  /** Returns new violations and whether the car just finished a turn (to cancel the indicator). */
  update(car: CarState, signal: Signal, t: number, hitKerb: boolean): { violations: ViolationKind[]; turned: boolean } {
    const violations: ViolationKind[] = []
    let turned = false

    if (hitKerb && t >= this.kerbCooldownUntil) {
      violations.push('kerb')
      this.kerbCooldownUntil = t + KERB_COOLDOWN
    }

    const place = locate(car)
    if (place.kind === 'junction') {
      if (this.visit?.junction !== place.junction) this.enterJunction(place.junction, car, t, violations)
      this.noteSignal(car, signal)
    } else {
      if (this.visit) turned = this.exitJunction(car, violations)
      if (place.kind === 'segment') this.checkSegment(place.segment, car, t, violations)
    }
    this.checkSpeed(car, t, violations)
    return { violations, turned }
  }

  private enterJunction(junction: Junction, car: CarState, t: number, out: ViolationKind[]): void {
    this.visit = { junction, entryHeading: car.heading, signals: new Set() }
    const stoppedHere = this.stoppedAt === junction.key
    this.stoppedAt = null
    if (car.speed <= 0) return // rolling back into the box isn't running a light
    if (junction.control === 'light' && lightState(junction, this.lastAxis, t).color === 'red') out.push('red_light')
    if (junction.control === 'stop' && !stoppedHere) out.push('stop_sign')
  }

  private noteSignal(car: CarState, signal: Signal): void {
    if (!this.visit || !signal) return
    if (Math.abs(wrapAngle(car.heading - this.visit.entryHeading)) < SIGNAL_WINDOW) this.visit.signals.add(signal)
  }

  private exitJunction(car: CarState, out: ViolationKind[]): boolean {
    const visit = this.visit
    this.visit = null
    if (!visit || car.speed <= 0) return false
    const delta = wrapAngle(car.heading - visit.entryHeading)
    if (Math.abs(delta) < TURN_THRESHOLD) return false
    // A U-turn (|delta| near π) is signalled left, like a left turn.
    const turn = delta > 0 && delta < (3 * Math.PI) / 4 ? 'right' : 'left'
    if (!visit.signals.has(turn)) out.push('no_signal')
    return true
  }

  private checkSegment(segment: Segment, car: CarState, t: number, out: ViolationKind[]): void {
    this.lastAxis = segment.axis
    this.limit = segment.limit

    const facing = directionAlong(segment.axis, car.heading)
    const { origin, arrival, fwd, right } = frame(segment, facing)
    const along = (car.x - origin.x) * fwd.x + (car.y - origin.y) * fwd.y
    if (arrival.control === 'stop' && Math.abs(car.speed) < STOPPED_SPEED && BLOCK - ZONE - along < STOP_DISTANCE) {
      this.stoppedAt = arrival.key
    }

    if (Math.abs(car.speed) < 1) {
      this.wrongLaneSince = null
      return
    }
    // Lane sides follow the way the car faces, so reversing a little down your own lane is fine.
    const lateral = (car.x - origin.x) * right.x + (car.y - origin.y) * right.y
    if (lateral < -WRONG_LANE_MARGIN) {
      this.wrongLaneSince ??= t
      if (!this.wrongLaneReported && t - this.wrongLaneSince >= WRONG_LANE_GRACE) {
        out.push('wrong_lane')
        this.wrongLaneReported = true
      }
    } else {
      this.wrongLaneSince = null
      this.wrongLaneReported = false
    }
  }

  private checkSpeed(car: CarState, t: number, out: ViolationKind[]): void {
    const kmh = Math.abs(car.speed) * 3.6
    if (kmh > this.limit + SPEED_TOLERANCE) {
      this.speedingSince ??= t
      if (!this.speedingReported && t - this.speedingSince >= SPEEDING_GRACE) {
        out.push('speeding')
        this.speedingReported = true
      }
    } else if (kmh <= this.limit) {
      this.speedingSince = null
      this.speedingReported = false
    }
  }
}
