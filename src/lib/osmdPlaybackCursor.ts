import type { OsmdInkNormMeasureSpan, RendererPageMeasureBounds } from '@/lib/musicXmlNoteAnchors'
import type { PlaybackSystemLayout } from '@/lib/playbackStaffLayout'
import { parseMeasureTickRangesFromMusicXml } from '@/lib/musicXmlSemanticPlayback'

export interface OsmdPlaybackCursorHit {
  page1Based: number
  measureListIndex0: number
  withinMeasureT: number
  nxInk: number
  nyInk: number | null
  pageDerivedProgress: number
  nyTop: number | null
  nyBottom: number | null
}

let rangesCacheKey = ''
let rangesCache: ReturnType<typeof parseMeasureTickRangesFromMusicXml> | null = null

function getMeasureRangesCached(musicXml: string, cacheKey: string) {
  const key = `${cacheKey}|${musicXml.length}`
  if (rangesCache && rangesCacheKey === key) return rangesCache
  rangesCacheKey = key
  rangesCache = parseMeasureTickRangesFromMusicXml(musicXml)
  return rangesCache
}

interface PerMeasureChordHeadTicks {
  measureTickStart: number
  measureTickEnd: number
  chordHeadRelativeTicks: number[]
}

let chordTicksCacheKey = ''
let chordTicksCache: Map<number, PerMeasureChordHeadTicks> | null = null

function buildMeasureChordHeadTicksCached(musicXml: string, cacheKey: string): Map<number, PerMeasureChordHeadTicks> | null {
  const key = `${cacheKey}|chord|${musicXml.length}`
  if (chordTicksCache && chordTicksCacheKey === key) return chordTicksCache
  chordTicksCacheKey = key
  chordTicksCache = buildMeasureChordHeadTicks(musicXml)
  return chordTicksCache
}

function buildMeasureChordHeadTicks(musicXml: string): Map<number, PerMeasureChordHeadTicks> | null {
  const xml = musicXml.trim()
  if (!xml) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml')
  if (doc.querySelector('parsererror')) return null
  const root = doc.documentElement
  if (!root || root.localName !== 'score-partwise') return null
  const part = Array.from(root.children).find((el) => el.localName === 'part') as Element | undefined
  if (!part) return null

  const measures = Array.from(part.children).filter((el) => el.localName === 'measure')
  const out = new Map<number, PerMeasureChordHeadTicks>()

  let runningTick = 0

  measures.forEach((measureEl, measureListIndex0) => {
    let cursor = 0
    let lastNoteStart = 0
    let maxCursor = 0
    const chordHeadTicks: number[] = []

    Array.from(measureEl.children).forEach((child) => {
      const name = child.localName
      if (name === 'backup') {
        const dur = Number(child.querySelector('duration')?.textContent ?? 0)
        if (Number.isFinite(dur) && dur > 0) {
          cursor = Math.max(0, cursor - dur)
        }
        return
      }
      if (name === 'forward') {
        const dur = Number(child.querySelector('duration')?.textContent ?? 0)
        if (Number.isFinite(dur) && dur > 0) {
          cursor += dur
          maxCursor = Math.max(maxCursor, cursor)
        }
        return
      }
      if (name !== 'note') return

      const isChord = !!child.querySelector('chord')
      const dur = Number(child.querySelector('duration')?.textContent ?? 0)
      const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 0
      const start = isChord ? lastNoteStart : cursor
      if (!isChord) {
        lastNoteStart = cursor
        cursor += safeDur
        chordHeadTicks.push(start)
      }
      maxCursor = Math.max(maxCursor, cursor, start + safeDur)
    })

    const measureTicks = Math.max(1, Math.floor(maxCursor))
    out.set(measureListIndex0, {
      measureTickStart: runningTick,
      measureTickEnd: runningTick + measureTicks,
      chordHeadRelativeTicks: chordHeadTicks,
    })
    runningTick += measureTicks
  })

  return out.size > 0 ? out : null
}

/**
 * 小节内横向位置 [0,1]：按 tick 在小节内的比例连续推进。
 * 多和弦头时在 tick 轴上于各和弦头时刻之间插值，避免整小节停在左侧小节线（旧逻辑在单和弦小节恒为 0）。
 */
export function resolveMeasureInkHorizontalT(
  withinMeasureT: number,
  measureDurationTicks: number,
  chordHeadRelativeTicks: number[] | null | undefined,
): number {
  const base = Math.max(0, Math.min(1, withinMeasureT))
  if (!chordHeadRelativeTicks?.length || chordHeadRelativeTicks.length < 2 || measureDurationTicks <= 0) {
    return base
  }

  const relTick = base * measureDurationTicks
  for (let i = 0; i < chordHeadRelativeTicks.length; i += 1) {
    const tickStart = chordHeadRelativeTicks[i]!
    const tickEnd =
      i + 1 < chordHeadRelativeTicks.length
        ? chordHeadRelativeTicks[i + 1]!
        : measureDurationTicks
    if (relTick < tickStart - 1e-9 && i > 0) continue
    if (relTick > tickEnd + 1e-9 && i + 1 < chordHeadRelativeTicks.length) continue

    const span = Math.max(1e-9, tickEnd - tickStart)
    const local = Math.max(0, Math.min(1, (relTick - tickStart) / span))
    const t0 = tickStart / measureDurationTicks
    const t1 = tickEnd / measureDurationTicks
    return Math.max(0, Math.min(1, t0 + (t1 - t0) * local))
  }

  return base
}

function measureInkNormX(
  measureListIndex0: number,
  horizontalT: number,
  inkSpans: OsmdInkNormMeasureSpan[],
): { nx: number; nyCenter: number | null; nyTop: number | null; nyBottom: number | null } | null {
  if (!inkSpans.length) return null
  const hits = inkSpans.filter((s) => s.measureListIndex === measureListIndex0)
  if (!hits.length) return null

  const firstPart = hits.filter((s) => s.partIndex0 === undefined || s.partIndex0 === 0)
  const spansForX = firstPart.length > 0 ? firstPart : hits
  /** 连谱（钢琴等）纵向范围需合并同一小节全部声部，不能只用 part 0 */
  const spansForY = hits

  let L = Number.POSITIVE_INFINITY
  let R = Number.NEGATIVE_INFINITY
  let nySum = 0
  let nyN = 0
  let nyT = Number.POSITIVE_INFINITY
  let nyB = Number.NEGATIVE_INFINITY
  for (const s of spansForX) {
    L = Math.min(L, s.left)
    R = Math.max(R, s.right)
  }
  for (const s of spansForY) {
    const top = s.top
    const bottom = s.bottom
    if (
      typeof top === 'number' &&
      typeof bottom === 'number' &&
      Number.isFinite(top) &&
      Number.isFinite(bottom) &&
      bottom > top + 1e-6
    ) {
      nySum += (top + bottom) / 2
      nyN += 1
      nyT = Math.min(nyT, top)
      nyB = Math.max(nyB, bottom)
    }
  }
  if (!Number.isFinite(L) || !Number.isFinite(R) || R <= L + 1e-9) return null

  const t = Math.max(0, Math.min(1, horizontalT))
  const nx = L + (R - L) * t
  const nyCenter = nyN > 0 ? nySum / nyN : null
  const nyTop = Number.isFinite(nyT) ? nyT : null
  const nyBottom = Number.isFinite(nyB) ? nyB : null
  return { nx: Math.max(0, Math.min(1, nx)), nyCenter, nyTop, nyBottom }
}

function systemInkHorizontal(s: PlaybackSystemLayout): { left: number; span: number } | null {
  if (
    typeof s.inkLeft === 'number' &&
    typeof s.inkSpan === 'number' &&
    Number.isFinite(s.inkLeft) &&
    Number.isFinite(s.inkSpan) &&
    s.inkSpan > 1e-9
  ) {
    return { left: s.inkLeft, span: s.inkSpan }
  }
  return null
}

export function inkNormXToSystemLocalProgress(
  nxInk: number,
  systems: PlaybackSystemLayout[],
): { systemIndex: number; inSystemProgress: number } {
  const nx = Math.max(0, Math.min(1, nxInk))
  if (!systems.length) return { systemIndex: 0, inSystemProgress: nx }

  const inkSystems = systems
    .map((s, index) => ({ index, ink: systemInkHorizontal(s) }))
    .filter((x): x is { index: number; ink: { left: number; span: number } } => x.ink != null)

  if (inkSystems.length === systems.length) {
    for (const { index, ink } of inkSystems) {
      const L = ink.left
      const R = L + ink.span
      if (nx >= L - 1e-9 && nx <= R + 1e-9) {
        const t = (nx - L) / Math.max(1e-9, ink.span)
        return { systemIndex: index, inSystemProgress: Math.max(0, Math.min(1, t)) }
      }
    }
    let bestJ = inkSystems[0]!.index
    let bestD = Number.POSITIVE_INFINITY
    for (const { index, ink } of inkSystems) {
      const mid = ink.left + ink.span / 2
      const d = Math.abs(nx - mid)
      if (d < bestD) {
        bestD = d
        bestJ = index
      }
    }
    const ink = systemInkHorizontal(systems[bestJ]!)!
    const t = (nx - ink.left) / Math.max(1e-9, ink.span)
    return { systemIndex: bestJ, inSystemProgress: Math.max(0, Math.min(1, t)) }
  }

  const unionLeft = Math.min(...systems.map((s) => s.startRatio))
  const unionRight = Math.max(...systems.map((s) => s.startRatio + s.spanRatio))
  const uSpan = Math.max(1e-9, unionRight - unionLeft)
  const hostXRatio = unionLeft + nx * uSpan

  for (let j = 0; j < systems.length; j += 1) {
    const s = systems[j]!
    const L = s.startRatio
    const R = L + s.spanRatio
    if (hostXRatio >= L - 1e-9 && hostXRatio <= R + 1e-9) {
      const t = (hostXRatio - L) / Math.max(1e-9, R - L)
      return { systemIndex: j, inSystemProgress: Math.max(0, Math.min(1, t)) }
    }
  }

  let bestJ = 0
  let bestD = Number.POSITIVE_INFINITY
  for (let j = 0; j < systems.length; j += 1) {
    const s = systems[j]!
    const mid = s.startRatio + s.spanRatio / 2
    const d = Math.abs(hostXRatio - mid)
    if (d < bestD) {
      bestD = d
      bestJ = j
    }
  }
  const s = systems[bestJ]!
  const L = s.startRatio
  const R = L + s.spanRatio
  const t = (hostXRatio - L) / Math.max(1e-9, R - L)
  return { systemIndex: bestJ, inSystemProgress: Math.max(0, Math.min(1, t)) }
}

function pickSystemIndexByNyInk(
  nyInk: number | null,
  systems: PlaybackSystemLayout[],
): number | null {
  if (nyInk == null || !Number.isFinite(nyInk) || systems.length <= 1) return null
  const y = Math.max(0, Math.min(1, nyInk))

  const hasNorm = systems.every(
    (s) =>
      typeof s.nyTop === 'number' &&
      typeof s.nyBottom === 'number' &&
      Number.isFinite(s.nyTop) &&
      Number.isFinite(s.nyBottom) &&
      s.nyBottom > s.nyTop,
  )
  if (hasNorm) {
    for (let i = 0; i < systems.length; i += 1) {
      const s = systems[i]!
      if (y >= s.nyTop! - 1e-6 && y <= s.nyBottom! + 1e-6) return i
    }
    let bestI = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let i = 0; i < systems.length; i += 1) {
      const s = systems[i]!
      const mid = (s.nyTop! + s.nyBottom!) / 2
      const d = Math.abs(y - mid)
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    return bestI
  }

  const n = systems.length
  return Math.min(n - 1, Math.max(0, Math.floor(y * n)))
}

export function resolveOsmdPlaybackCursorHit(params: {
  currentTick: number
  totalMidiTicks: number
  musicXml: string
  pageBounds: RendererPageMeasureBounds[]
  pageInkSpansByPage: OsmdInkNormMeasureSpan[][]
  layoutCacheKey?: string
}): OsmdPlaybackCursorHit | null {
  const xml = params.musicXml.trim()
  if (!xml || params.totalMidiTicks <= 0) return null
  const bounds = params.pageBounds
  const pages = params.pageInkSpansByPage
  if (!bounds.length || bounds.length !== pages.length) return null

  const ranges = getMeasureRangesCached(xml, params.layoutCacheKey ?? xml.slice(0, 64))
  if (!ranges.length) return null

  const abstractEnd = ranges[ranges.length - 1]!.tickEnd
  if (!Number.isFinite(abstractEnd) || abstractEnd <= 0) return null

  const scale = params.totalMidiTicks / abstractEnd
  const tick = Math.max(0, Math.min(params.totalMidiTicks, Math.floor(params.currentTick)))

  let lo = 0
  let hi = ranges.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    const ts = ranges[mid]!.tickStart * scale
    if (ts <= tick) lo = mid
    else hi = mid - 1
  }
  const r = ranges[lo]!
  const ts = r.tickStart * scale
  const te = r.tickEnd * scale
  const span = Math.max(1e-9, te - ts)
  const withinMeasureT = Math.max(0, Math.min(1, (tick - ts) / span))
  const measureListIndex0 = r.measureListIndex0

  const chordTicks = buildMeasureChordHeadTicksCached(xml, params.layoutCacheKey ?? xml.slice(0, 64))
  const perMeasureChords = chordTicks?.get(measureListIndex0)
  const measureDurationTicks = Math.max(1, Math.round(te - ts))
  const horizontalT = resolveMeasureInkHorizontalT(
    withinMeasureT,
    measureDurationTicks,
    perMeasureChords?.chordHeadRelativeTicks,
  )

  let page1Based = 1
  let found = false
  for (let p = 0; p < bounds.length; p += 1) {
    const b = bounds[p]!
    if (
      measureListIndex0 >= b.start &&
      measureListIndex0 <= b.end &&
      Number.isFinite(b.start) &&
      Number.isFinite(b.end)
    ) {
      page1Based = p + 1
      found = true
      break
    }
  }
  if (!found) {
    let best = 1
    let bestDist = Number.POSITIVE_INFINITY
    for (let p = 0; p < bounds.length; p += 1) {
      const b = bounds[p]!
      const mid = (b.start + b.end) / 2
      const d = Math.abs(measureListIndex0 - mid)
      if (d < bestDist) {
        bestDist = d
        best = p + 1
      }
    }
    page1Based = best
  }

  const pb = bounds[page1Based - 1]
  const pageMeasureCount = pb ? Math.max(1, pb.end - pb.start + 1) : 1
  const idxInPage = pb ? measureListIndex0 - pb.start + withinMeasureT : withinMeasureT
  const pageDerivedProgress = Math.max(0, Math.min(1, idxInPage / pageMeasureCount))

  const inkSpans = pages[page1Based - 1] ?? []
  const ink = measureInkNormX(measureListIndex0, horizontalT, inkSpans)
  const nxInk = ink?.nx ?? pageDerivedProgress
  const nyInk = ink?.nyCenter ?? null
  const nyTop = ink?.nyTop ?? null
  const nyBottom = ink?.nyBottom ?? null

  return {
    page1Based,
    measureListIndex0,
    withinMeasureT,
    nxInk,
    nyInk,
    pageDerivedProgress,
    nyTop,
    nyBottom,
  }
}

export function resolveOsmdSystemProgressFromInk(params: {
  nxInk: number
  nyInk: number | null
  systems: PlaybackSystemLayout[] | null | undefined
}): { systemIndex: number; inSystemProgress: number } {
  const systems = params.systems?.length ? params.systems : null
  if (!systems) {
    return { systemIndex: 0, inSystemProgress: Math.max(0, Math.min(1, params.nxInk)) }
  }
  const byNy = pickSystemIndexByNyInk(params.nyInk, systems)
  if (byNy != null && systems.length > 1) {
    const s = systems[byNy]!
    const ink = systemInkHorizontal(s)
    if (ink) {
      const t = (params.nxInk - ink.left) / Math.max(1e-9, ink.span)
      return { systemIndex: byNy, inSystemProgress: Math.max(0, Math.min(1, t)) }
    }
    const L = s.startRatio
    const R = L + s.spanRatio
    const unionLeft = Math.min(...systems.map((x) => x.startRatio))
    const unionRight = Math.max(...systems.map((x) => x.startRatio + x.spanRatio))
    const uSpan = Math.max(1e-9, unionRight - unionLeft)
    const hostXRatio = unionLeft + params.nxInk * uSpan
    const t = (hostXRatio - L) / Math.max(1e-9, R - L)
    return { systemIndex: byNy, inSystemProgress: Math.max(0, Math.min(1, t)) }
  }
  return inkNormXToSystemLocalProgress(params.nxInk, systems)
}
