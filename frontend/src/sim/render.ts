import { CAR_LENGTH, CAR_WIDTH } from './car'
import type { Sim } from './engine'
import {
  BLOCK,
  blockRect,
  COLS,
  FILLET,
  HALF_ROAD,
  junctions,
  lightState,
  MAX_X,
  MAX_Y,
  pointOn,
  ROUTE,
  ROWS,
  segments,
  SIDEWALK,
  ZONE,
  type Dir,
  type Junction,
  type LightColor,
  type Segment,
  type Vec,
} from './world'

export interface Viewport {
  /** CSS pixels */
  width: number
  height: number
  dpr: number
}

// The map keeps daylight colours in both themes: it is a picture of a street, not page chrome.
const C = {
  grass: '#7aa85f',
  tree: '#4f7f3c',
  asphalt: '#4b5058',
  sidewalk: '#cfc9bb',
  kerb: '#9c9686',
  lot: '#dcd5c3',
  marking: '#f4f4ef',
  signRed: '#c8102e',
  signBlue: '#0b5cad',
  car: '#d62839',
  glass: '#1d2a38',
  amber: '#ffb31a',
} as const

const ROOFS = ['#b9764f', '#8e9aa8', '#c9a46b', '#7d8f74', '#a5655b', '#9d8fb0']
const LAMP_ON: Record<LightColor, string> = { red: '#ff3b3b', yellow: '#ffc21a', green: '#3ddc84' }
const LAMP_OFF = '#3a3f47'

/** Text drawn in world units: canvas fonts misbehave at sub-pixel sizes, so draw large and scale down. */
function worldText(ctx: CanvasRenderingContext2D, text: string, at: Vec, size: number, color: string): void {
  const k = 20
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.scale(1 / k, 1 / k)
  ctx.font = `700 ${size * k}px 'Barlow Condensed', 'Arial Narrow', sans-serif`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** Fills the quad spanning `along` a0..a1 and `lateral` l0..l1 in a segment's travel frame. */
function fillQuad(ctx: CanvasRenderingContext2D, s: Segment, dir: Dir, a0: number, a1: number, l0: number, l1: number): void {
  const pts = [pointOn(s, dir, a0, l0), pointOn(s, dir, a1, l0), pointOn(s, dir, a1, l1), pointOn(s, dir, a0, l1)]
  ctx.beginPath()
  pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
}

/** Each road arm entering a junction, with the direction that arrives at it. */
function arms(junction: Junction): { segment: Segment; dir: Dir }[] {
  return segments
    .filter((s) => s.from === junction || s.to === junction)
    .map((segment) => ({ segment, dir: segment.to === junction ? 1 : -1 }))
}

const hash = (...n: number[]) => n.reduce((h, v) => (h * 31 + v * 17 + 7) % 9973, 1)

function drawGround(ctx: CanvasRenderingContext2D): void {
  // Trees around the town.
  ctx.fillStyle = C.tree
  const edge = HALF_ROAD + SIDEWALK + 6
  for (let x = -edge; x <= MAX_X + edge; x += 13) {
    for (const y of [-edge, MAX_Y + edge]) {
      ctx.beginPath()
      ctx.arc(x, y, 2.4 + (hash(x, y) % 3) * 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (let y = -edge + 13; y < MAX_Y + edge; y += 13) {
    for (const x of [-edge, MAX_X + edge]) {
      ctx.beginPath()
      ctx.arc(x, y, 2.4 + (hash(x, y) % 3) * 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const outer = HALF_ROAD + SIDEWALK
  ctx.fillStyle = C.sidewalk
  ctx.fillRect(-outer, -outer, MAX_X + 2 * outer, MAX_Y + 2 * outer)
  ctx.fillStyle = C.asphalt
  ctx.fillRect(-HALF_ROAD, -HALF_ROAD, MAX_X + 2 * HALF_ROAD, MAX_Y + 2 * HALF_ROAD)

  for (let i = 0; i < COLS - 1; i++) {
    for (let j = 0; j < ROWS - 1; j++) drawBlock(ctx, i, j)
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, i: number, j: number): void {
  const b = blockRect(i, j)
  ctx.fillStyle = C.sidewalk
  ctx.strokeStyle = C.kerb
  ctx.lineWidth = 0.35
  ctx.beginPath()
  ctx.roundRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, FILLET)
  ctx.fill()
  ctx.stroke()

  const lot = { x0: b.x0 + SIDEWALK, y0: b.y0 + SIDEWALK, x1: b.x1 - SIDEWALK, y1: b.y1 - SIDEWALK }
  ctx.fillStyle = C.lot
  ctx.beginPath()
  ctx.roundRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0, FILLET - SIDEWALK)
  ctx.fill()

  // Four buildings per block, sized and coloured from a stable hash.
  const gap = 5
  const w = (lot.x1 - lot.x0 - 3 * gap) / 2
  const h = (lot.y1 - lot.y0 - 3 * gap) / 2
  for (let k = 0; k < 4; k++) {
    const seed = hash(i, j, k)
    const shrink = (seed % 5) * 1.5
    const x = lot.x0 + gap + (k % 2) * (w + gap) + shrink / 2
    const y = lot.y0 + gap + Math.floor(k / 2) * (h + gap) + shrink / 2
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.fillRect(x + 1, y + 1, w - shrink, h - shrink)
    ctx.fillStyle = ROOFS[seed % ROOFS.length]
    ctx.fillRect(x, y, w - shrink, h - shrink)
  }
  if (i === 1 && j === 0) {
    const centre = { x: (lot.x0 + lot.x1) / 2, y: (lot.y0 + lot.y1) / 2 }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.fillRect(centre.x - 13, centre.y - 2.6, 26, 5.2)
    worldText(ctx, 'TRƯỜNG HỌC', centre, 3.4, C.signBlue)
  }
}

function drawMarkings(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.marking
  for (const s of segments) {
    // Centre line: dashed, solid where it approaches a controlled junction (no overtaking there).
    const a = ZONE
    const b = BLOCK - ZONE
    const solidStart = s.from.control === 'none' ? a : a + 12
    const solidEnd = s.to.control === 'none' ? b : b - 12
    fillQuad(ctx, s, 1, a, solidStart, -0.08, 0.08)
    fillQuad(ctx, s, 1, solidEnd, b, -0.08, 0.08)
    for (let d = solidStart; d < solidEnd; d += 6) fillQuad(ctx, s, 1, d, Math.min(d + 3, solidEnd), -0.08, 0.08)
  }

  for (const junction of junctions) {
    if (junction.control === 'none') continue
    for (const { segment, dir } of arms(junction)) {
      // Stop line across the arriving lane, on the edge of the rule zone.
      fillQuad(ctx, segment, dir, BLOCK - ZONE - 0.5, BLOCK - ZONE, 0, HALF_ROAD)
      if (junction.control === 'light') {
        for (let l = -HALF_ROAD + 0.5; l < HALF_ROAD; l += 1.1) {
          fillQuad(ctx, segment, dir, BLOCK - ZONE + 0.7, BLOCK - HALF_ROAD - 0.7, l, l + 0.55)
        }
      } else {
        worldText(ctx, 'STOP', pointOn(segment, dir, BLOCK - ZONE - 2.6, HALF_ROAD / 2), 2.2, C.marking)
      }
    }
  }
}

function drawSpeedSign(ctx: CanvasRenderingContext2D, at: Vec, limit: number): void {
  ctx.beginPath()
  ctx.arc(at.x, at.y, 1.3, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 0.32
  ctx.strokeStyle = C.signRed
  ctx.stroke()
  worldText(ctx, String(limit), { x: at.x, y: at.y + 0.08 }, 1.35, '#111111')
}

function drawStopSign(ctx: CanvasRenderingContext2D, at: Vec): void {
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const angle = Math.PI / 8 + (k * Math.PI) / 4
    const x = at.x + Math.cos(angle) * 1.35
    const y = at.y + Math.sin(angle) * 1.35
    if (k === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = C.signRed
  ctx.fill()
  ctx.lineWidth = 0.15
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  worldText(ctx, 'STOP', { x: at.x, y: at.y + 0.06 }, 0.95, '#ffffff')
}

function drawLight(ctx: CanvasRenderingContext2D, at: Vec, color: LightColor, remaining: number): void {
  ctx.fillStyle = '#16191d'
  ctx.beginPath()
  ctx.roundRect(at.x - 0.75, at.y - 2, 1.5, 4, 0.35)
  ctx.fill()
  const lamps: LightColor[] = ['red', 'yellow', 'green']
  lamps.forEach((lamp, k) => {
    ctx.beginPath()
    ctx.arc(at.x, at.y - 1.25 + k * 1.25, 0.48, 0, Math.PI * 2)
    ctx.fillStyle = lamp === color ? LAMP_ON[lamp] : LAMP_OFF
    ctx.fill()
  })
  // Countdown display, as on most Vietnamese signals.
  ctx.fillStyle = '#16191d'
  ctx.fillRect(at.x - 0.95, at.y + 2.2, 1.9, 1.5)
  worldText(ctx, String(remaining).padStart(2, '0'), { x: at.x, y: at.y + 2.97 }, 1.3, LAMP_ON[color])
}

function drawRoadside(ctx: CanvasRenderingContext2D, t: number): void {
  const kerbSide = HALF_ROAD + SIDEWALK / 2
  for (const s of segments) {
    for (const dir of [1, -1] as const) drawSpeedSign(ctx, pointOn(s, dir, ZONE + 10, kerbSide), s.limit)
  }
  for (const junction of junctions) {
    for (const { segment, dir } of arms(junction)) {
      if (junction.control === 'stop') {
        drawStopSign(ctx, pointOn(segment, dir, BLOCK - ZONE - 1.5, kerbSide))
      } else if (junction.control === 'light') {
        const { color, remaining } = lightState(junction, segment.axis, t)
        drawLight(ctx, pointOn(segment, dir, BLOCK - ZONE + 1, kerbSide + 0.5), color, remaining)
      }
    }
  }
}

function drawCheckpoint(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const target = ROUTE[sim.checkpoint]
  if (!target) return
  const { x, y } = target.position
  const r = 3.2 + Math.sin(sim.t * 4) * 0.35
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(11, 92, 173, 0.35)'
  ctx.fill()
  ctx.lineWidth = 0.35
  ctx.strokeStyle = '#7fb2ee'
  ctx.stroke()
  worldText(ctx, String(sim.checkpoint + 1), { x, y: y + 0.15 }, 3, '#ffffff')
}

function drawCar(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const { car, signal, braking, t } = sim
  const hl = CAR_LENGTH / 2
  const hw = CAR_WIDTH / 2
  ctx.save()
  ctx.translate(car.x, car.y)
  ctx.rotate(car.heading)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.beginPath()
  ctx.roundRect(-hl + 0.25, -hw + 0.25, CAR_LENGTH, CAR_WIDTH, 0.5)
  ctx.fill()

  // Front wheels show the steering angle.
  ctx.fillStyle = '#111111'
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(hl - 0.95, side * (hw - 0.05))
    ctx.rotate(car.steer)
    ctx.fillRect(-0.35, -0.13, 0.7, 0.26)
    ctx.restore()
  }

  ctx.fillStyle = C.car
  ctx.beginPath()
  ctx.roundRect(-hl, -hw, CAR_LENGTH, CAR_WIDTH, 0.5)
  ctx.fill()
  ctx.fillStyle = C.glass
  ctx.fillRect(hl - 1.75, -hw + 0.2, 0.75, CAR_WIDTH - 0.4) // windscreen
  ctx.fillRect(-hl + 0.55, -hw + 0.25, 0.5, CAR_WIDTH - 0.5) // rear window
  ctx.fillStyle = '#fff6c9'
  ctx.fillRect(hl - 0.15, -hw + 0.15, 0.15, 0.4)
  ctx.fillRect(hl - 0.15, hw - 0.55, 0.15, 0.4)
  ctx.fillStyle = braking ? '#ff2a2a' : '#7a1414'
  ctx.fillRect(-hl, -hw + 0.15, 0.15, 0.4)
  ctx.fillRect(-hl, hw - 0.55, 0.15, 0.4)

  if (signal && t % 0.8 < 0.45) {
    const side = signal === 'right' ? 1 : -1 // +y is the car's right in its own frame
    ctx.fillStyle = C.amber
    for (const x of [hl - 0.25, -hl + 0.25]) {
      ctx.beginPath()
      ctx.arc(x, side * (hw - 0.1), 0.28, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** Points at the next checkpoint from the screen edge when it is out of view. */
function drawTargetArrow(ctx: CanvasRenderingContext2D, view: Viewport, scale: number, cam: Vec, sim: Sim): void {
  const target = ROUTE[sim.checkpoint]
  if (!target) return
  const dx = (target.position.x - cam.x) * scale
  const dy = (target.position.y - cam.y) * scale
  const inset = 34
  if (Math.abs(dx) < view.width / 2 - inset && Math.abs(dy) < view.height / 2 - inset) return
  const angle = Math.atan2(dy, dx)
  const reach = Math.min(
    (view.width / 2 - inset) / Math.max(Math.abs(Math.cos(angle)), 1e-6),
    (view.height / 2 - inset) / Math.max(Math.abs(Math.sin(angle)), 1e-6),
  )
  ctx.save()
  ctx.translate(view.width / 2 + Math.cos(angle) * reach, view.height / 2 + Math.sin(angle) * reach)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(16, 0)
  ctx.lineTo(-10, -12)
  ctx.lineTo(-4, 0)
  ctx.lineTo(-10, 12)
  ctx.closePath()
  ctx.fillStyle = C.signBlue
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fill()
  ctx.restore()
}

function drawMinimap(ctx: CanvasRenderingContext2D, view: Viewport, sim: Sim): void {
  const pad = 14
  const width = Math.min(170, view.width * 0.32)
  const k = width / (MAX_X + 2 * pad)
  const height = (MAX_Y + 2 * pad) * k
  const left = view.width - width - 12
  const top = 12
  ctx.save()
  ctx.fillStyle = 'rgba(16, 19, 24, 0.78)'
  ctx.beginPath()
  ctx.roundRect(left, top, width, height, 8)
  ctx.fill()
  ctx.translate(left + pad * k, top + pad * k)
  ctx.scale(k, k)

  ctx.strokeStyle = '#8a929e'
  ctx.lineWidth = 2 * HALF_ROAD
  ctx.lineCap = 'square'
  ctx.beginPath()
  for (const s of segments) {
    ctx.moveTo(s.from.x, s.from.y)
    ctx.lineTo(s.to.x, s.to.y)
  }
  ctx.stroke()

  const target = ROUTE[sim.checkpoint]
  if (target) {
    ctx.fillStyle = '#7fb2ee'
    ctx.beginPath()
    ctx.arc(target.position.x, target.position.y, 9, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.translate(sim.car.x, sim.car.y)
  ctx.rotate(sim.car.heading)
  ctx.fillStyle = '#ff5468'
  ctx.beginPath()
  ctx.moveTo(12, 0)
  ctx.lineTo(-8, -8)
  ctx.lineTo(-8, 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function drawScene(ctx: CanvasRenderingContext2D, view: Viewport, sim: Sim): void {
  const scale = Math.max(5, Math.min(view.width, view.height) / 55) // px per metre
  // Look ahead in the direction of travel so faster driving shows more road.
  const lookAhead = Math.min(Math.max(sim.car.speed, -4), 25) * 0.6
  const cam = {
    x: sim.car.x + Math.cos(sim.car.heading) * lookAhead,
    y: sim.car.y + Math.sin(sim.car.heading) * lookAhead,
  }

  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
  ctx.fillStyle = C.grass
  ctx.fillRect(0, 0, view.width, view.height)

  ctx.save()
  ctx.translate(view.width / 2, view.height / 2)
  ctx.scale(scale, scale)
  ctx.translate(-cam.x, -cam.y)
  drawGround(ctx)
  drawMarkings(ctx)
  drawRoadside(ctx, sim.t)
  drawCheckpoint(ctx, sim)
  drawCar(ctx, sim)
  ctx.restore()

  drawTargetArrow(ctx, view, scale, cam, sim)
  drawMinimap(ctx, view, sim)
}
