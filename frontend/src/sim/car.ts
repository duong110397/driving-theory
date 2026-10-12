import { wrapAngle, type Vec } from './world'

/** Arcade bicycle model: forgiving enough for a keyboard, but with real turning radii and braking. */
export interface CarState {
  x: number
  y: number
  /** Radians; 0 = east, growing clockwise on screen. */
  heading: number
  /** m/s along the heading; negative when reversing. */
  speed: number
  /** Front-wheel angle in radians; positive steers right. */
  steer: number
}

export interface Controls {
  throttle: boolean
  brake: boolean
  left: boolean
  right: boolean
}

/** Direction keys held (arrows / WASD / touch pad), in screen directions. */
export interface DirectionKeys {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

const NO_CONTROLS: Readonly<Controls> = { throttle: false, brake: false, left: false, right: false }

/** Within this angle the car counts as pointing where the arrow points, so it stops steering. */
const ALIGNED = 0.04 // rad
/** An arrow further than this from the heading points behind the car: back up instead. */
const REVERSE_BEYOND = (3 * Math.PI) / 4

/**
 * Screen-direction driving: hold the arrow pointing where the car should go. It drives forward and
 * steers toward that direction, or backs up when the arrow points behind it — facing east, → drives
 * and ← reverses; facing north, ↑ drives and ← / → turn the car toward that side.
 */
export function controlsToward(car: CarState, keys: DirectionKeys): Controls {
  const dx = Number(keys.right) - Number(keys.left)
  const dy = Number(keys.down) - Number(keys.up)
  if (dx === 0 && dy === 0) return NO_CONTROLS
  const delta = wrapAngle(Math.atan2(dy, dx) - car.heading)
  if (Math.abs(delta) <= REVERSE_BEYOND) {
    return { throttle: true, brake: false, left: delta < -ALIGNED, right: delta > ALIGNED }
  }
  // Swing the tail toward the arrow. Reversing flips steering: left lock turns the car clockwise.
  const tail = wrapAngle(delta - Math.PI)
  return { throttle: false, brake: true, left: tail > ALIGNED, right: tail < -ALIGNED }
}

export const CAR_LENGTH = 4.4
export const CAR_WIDTH = 1.8
const WHEELBASE = 2.7

const ACCEL = 3.2 // m/s²
const BRAKE = 9
const REVERSE_ACCEL = 2.5
const MAX_SPEED = 25 // 90 km/h
const MAX_REVERSE = 4
const ROLLING_DRAG = 0.6
const AIR_DRAG = 0.0025
const MAX_STEER = 0.55
const STEER_RATE = 2.2 // rad/s

export function stepCar(car: CarState, controls: Controls, dt: number): CarState {
  let speed = car.speed
  let accel = 0
  if (controls.throttle) accel += speed < -0.1 ? BRAKE : ACCEL * (1 - speed / MAX_SPEED)
  if (controls.brake) accel -= speed > 0.1 ? BRAKE : REVERSE_ACCEL
  const next = speed + accel * dt
  // Braking stops the car; reversing needs the pedal held again from standstill, not a sign flip mid-step.
  speed = (controls.brake && speed > 0 && next < 0) || (controls.throttle && speed < 0 && next > 0) ? 0 : next

  const drag = (ROLLING_DRAG + AIR_DRAG * speed * speed) * dt
  speed = Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag
  speed = Math.min(Math.max(speed, -MAX_REVERSE), MAX_SPEED)

  // Less lock at speed, as with real speed-sensitive steering.
  const lock = MAX_STEER / (1 + Math.abs(speed) * 0.12)
  const target = controls.left === controls.right ? 0 : controls.right ? lock : -lock
  const maxDelta = STEER_RATE * dt
  const steer = car.steer + Math.min(Math.max(target - car.steer, -maxDelta), maxDelta)

  const heading = car.heading + (speed / WHEELBASE) * Math.tan(steer) * dt
  const mid = (car.heading + heading) / 2
  return {
    x: car.x + Math.cos(mid) * speed * dt,
    y: car.y + Math.sin(mid) * speed * dt,
    heading,
    speed,
    steer,
  }
}

/** The four corners of the car body, used for kerb collisions. */
export function carCorners(car: CarState): Vec[] {
  const cos = Math.cos(car.heading)
  const sin = Math.sin(car.heading)
  const hl = CAR_LENGTH / 2
  const hw = CAR_WIDTH / 2
  return [
    [hl, hw],
    [hl, -hw],
    [-hl, hw],
    [-hl, -hw],
  ].map(([l, w]) => ({ x: car.x + cos * l - sin * w, y: car.y + sin * l + cos * w }))
}
