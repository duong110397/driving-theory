/**
 * The town map, in metres. Screen convention: x grows east, y grows south, so a heading of 0 faces
 * east and a growing heading turns clockwise (to the right). Traffic keeps to the right, as in Vietnam.
 *
 * Roads form a grid: `COLS` north-south roads and `ROWS` east-west roads, `BLOCK` metres apart,
 * each with one lane per direction. Junction corners are rounded with radius `FILLET`.
 */

export interface Vec {
  x: number
  y: number
}

export const BLOCK = 110
export const LANE_W = 4.5
/** Half the road width: one lane on each side of the centre line. */
export const HALF_ROAD = LANE_W
export const SIDEWALK = 3
export const FILLET = 6
/** Rule zone around a junction: the junction box plus the crosswalk before it. Stop lines sit on its edge. */
export const ZONE = HALF_ROAD + 5
export const COLS = 4
export const ROWS = 3
export const MAX_X = (COLS - 1) * BLOCK
export const MAX_Y = (ROWS - 1) * BLOCK

export type Control = 'light' | 'stop' | 'none'
export type Axis = 'ew' | 'ns'
/** +1 travels toward the segment's `to` end (east / south), -1 toward `from` (west / north). */
export type Dir = 1 | -1

export interface Junction {
  key: string
  i: number
  j: number
  x: number
  y: number
  control: Control
  /** Shifts the light cycle so neighbouring junctions don't switch in lockstep. */
  lightOffset: number
}

export interface Segment {
  axis: Axis
  i: number
  j: number
  /** West (ew) or north (ns) end. */
  from: Junction
  /** East (ew) or south (ns) end. */
  to: Junction
  /** km/h */
  limit: number
}

const CONTROLS: Readonly<Record<string, Control>> = {
  '1,1': 'light',
  '2,1': 'light',
  '1,0': 'stop',
  '2,2': 'stop',
  '0,1': 'stop',
  '3,1': 'stop',
}

const LIGHT_OFFSETS: Readonly<Record<string, number>> = { '1,1': 0, '2,1': 7 }

function speedLimit(axis: Axis, i: number, j: number): number {
  if (axis === 'ew' && j === 1) return 60 // the main avenue
  if (axis === 'ns' && i === 2) return 40 // school street
  return 50
}

function buildJunctions(): Junction[][] {
  return Array.from({ length: COLS }, (_, i) =>
    Array.from({ length: ROWS }, (_, j) => {
      const key = `${i},${j}`
      return { key, i, j, x: i * BLOCK, y: j * BLOCK, control: CONTROLS[key] ?? 'none', lightOffset: LIGHT_OFFSETS[key] ?? 0 }
    }),
  )
}

const JUNCTIONS = buildJunctions()

function buildSegments(): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      if (i < COLS - 1) {
        segments.push({ axis: 'ew', i, j, from: JUNCTIONS[i][j], to: JUNCTIONS[i + 1][j], limit: speedLimit('ew', i, j) })
      }
      if (j < ROWS - 1) {
        segments.push({ axis: 'ns', i, j, from: JUNCTIONS[i][j], to: JUNCTIONS[i][j + 1], limit: speedLimit('ns', i, j) })
      }
    }
  }
  return segments
}

export const junctions: readonly Junction[] = JUNCTIONS.flat()
export const segments: readonly Segment[] = buildSegments()

export function segmentAt(axis: Axis, i: number, j: number): Segment {
  const found = segments.find((s) => s.axis === axis && s.i === i && s.j === j)
  if (!found) throw new Error(`No ${axis} segment at ${i},${j}`)
  return found
}

// ---------- traffic lights ----------

export type LightColor = 'green' | 'yellow' | 'red'
const LIGHT_GREEN = 9
const LIGHT_YELLOW = 3
const LIGHT_CYCLE = 2 * (LIGHT_GREEN + LIGHT_YELLOW)

/** Colour shown to traffic moving along `axis`, and whole seconds until it changes. */
export function lightState(junction: Junction, axis: Axis, t: number): { color: LightColor; remaining: number } {
  const phase = (t + junction.lightOffset) % LIGHT_CYCLE
  // The cross axis runs half a cycle behind: one axis is red for exactly the other's green + yellow.
  const local = axis === 'ew' ? phase : (phase + LIGHT_CYCLE / 2) % LIGHT_CYCLE
  if (local < LIGHT_GREEN) return { color: 'green', remaining: Math.ceil(LIGHT_GREEN - local) }
  if (local < LIGHT_GREEN + LIGHT_YELLOW) return { color: 'yellow', remaining: Math.ceil(LIGHT_GREEN + LIGHT_YELLOW - local) }
  return { color: 'red', remaining: Math.ceil(LIGHT_CYCLE - local) }
}

// ---------- geometry ----------

/** Travel frame of a segment: origin at the departing junction, `right` = the driver's right-hand side. */
export function frame(segment: Segment, dir: Dir): { origin: Junction; arrival: Junction; fwd: Vec; right: Vec } {
  const fwd = segment.axis === 'ew' ? { x: dir, y: 0 } : { x: 0, y: dir }
  return {
    origin: dir === 1 ? segment.from : segment.to,
    arrival: dir === 1 ? segment.to : segment.from,
    fwd,
    // Rotating +90° in y-down screen space turns "forward" into "right".
    right: { x: -fwd.y, y: fwd.x },
  }
}

/** A point `along` metres from the departing junction and `lateral` metres to the driver's right. */
export function pointOn(segment: Segment, dir: Dir, along: number, lateral: number): Vec {
  const { origin, fwd, right } = frame(segment, dir)
  return { x: origin.x + fwd.x * along + right.x * lateral, y: origin.y + fwd.y * along + right.y * lateral }
}

/** Block (i, j) is the island between roads i..i+1 and j..j+1; its kerb is a rounded rectangle. */
export function blockRect(i: number, j: number): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: i * BLOCK + HALF_ROAD,
    y0: j * BLOCK + HALF_ROAD,
    x1: (i + 1) * BLOCK - HALF_ROAD,
    y1: (j + 1) * BLOCK - HALF_ROAD,
  }
}

/** True when the point is on asphalt (anywhere inside the outer roads but not on a block). */
export function onRoad(p: Vec): boolean {
  if (p.x < -HALF_ROAD || p.y < -HALF_ROAD || p.x > MAX_X + HALF_ROAD || p.y > MAX_Y + HALF_ROAD) return false
  const i = Math.floor(p.x / BLOCK)
  const j = Math.floor(p.y / BLOCK)
  if (i < 0 || j < 0 || i >= COLS - 1 || j >= ROWS - 1) return true
  const b = blockRect(i, j)
  if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) return true
  // Rounded-rectangle test: distance to the rectangle shrunk by the corner radius.
  const cx = Math.min(Math.max(p.x, b.x0 + FILLET), b.x1 - FILLET)
  const cy = Math.min(Math.max(p.y, b.y0 + FILLET), b.y1 - FILLET)
  return Math.hypot(p.x - cx, p.y - cy) > FILLET
}

export type Place =
  | { kind: 'junction'; junction: Junction }
  | { kind: 'segment'; segment: Segment }
  | { kind: 'off' }

/** Where a point is, for traffic rules: inside a junction zone, on a road segment, or neither. */
export function locate(p: Vec): Place {
  if (!onRoad(p)) return { kind: 'off' }
  const i = Math.min(Math.max(Math.round(p.x / BLOCK), 0), COLS - 1)
  const j = Math.min(Math.max(Math.round(p.y / BLOCK), 0), ROWS - 1)
  const junction = JUNCTIONS[i][j]
  if (Math.abs(p.x - junction.x) <= ZONE && Math.abs(p.y - junction.y) <= ZONE) return { kind: 'junction', junction }

  const row = Math.round(p.y / BLOCK)
  if (Math.abs(p.y - row * BLOCK) <= HALF_ROAD && row >= 0 && row < ROWS) {
    const col = Math.min(Math.max(Math.floor(p.x / BLOCK), 0), COLS - 2)
    return { kind: 'segment', segment: segmentAt('ew', col, row) }
  }
  const col = Math.round(p.x / BLOCK)
  if (Math.abs(p.x - col * BLOCK) <= HALF_ROAD && col >= 0 && col < COLS) {
    const r = Math.min(Math.max(Math.floor(p.y / BLOCK), 0), ROWS - 2)
    return { kind: 'segment', segment: segmentAt('ns', col, r) }
  }
  return { kind: 'off' } // a rounded corner just outside the junction zone
}

/** Wraps an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  const wrapped = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
  return wrapped === -Math.PI ? Math.PI : wrapped
}

// ---------- the exam route ----------

export interface Checkpoint {
  position: Vec
  /** Instruction shown in the HUD. */
  hint: string
}

const laneCentre = (segment: Segment, dir: Dir) => pointOn(segment, dir, BLOCK / 2, LANE_W / 2)

export const START = { position: pointOn(segmentAt('ew', 0, 1), 1, 28, LANE_W / 2), heading: 0 }

/** Five targets that between them cross both lights and a stop sign, with turns either way. */
export const ROUTE: readonly Checkpoint[] = [
  { position: laneCentre(segmentAt('ew', 1, 1), 1), hint: 'Đi thẳng qua ngã tư có đèn' },
  { position: laneCentre(segmentAt('ns', 2, 0), -1), hint: 'Rẽ trái tại ngã tư có đèn tiếp theo, vào đường 40 km/h' },
  { position: laneCentre(segmentAt('ew', 2, 0), 1), hint: 'Rẽ phải ở cuối đường' },
  { position: laneCentre(segmentAt('ns', 3, 1), 1), hint: 'Rẽ phải rồi qua ngã ba có biển STOP' },
  { position: laneCentre(segmentAt('ew', 2, 2), -1), hint: 'Rẽ phải về đích' },
]
