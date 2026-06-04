/**
 * 首声部 MusicXML 中每个 `<note>` 的累计 tick 区间（与 Verovio MIDI tick 线性对齐用途）。
 */
import { annotationDebugLog } from '@/lib/annotationDebug'

export interface TimedNoteEl {
  measure: Element
  note: Element
  tickStart: number
  tickEnd: number
  /** 该音符起始处相对小节开头的 divisions（与 `<offset sound="no">` 常用写法一致） */
  divisionsFromMeasureStart: number
}

function isChordNote(note: Element): boolean {
  return !!note.querySelector(':scope > chord')
}

/** 和弦组内第一个 `<note>`（主音，无 `<chord>` 子元素） */
export function chordHeadNote(note: Element): Element {
  let cur = note
  while (isChordNote(cur)) {
    const prev = cur.previousElementSibling
    if (!prev || prev.localName !== 'note') break
    cur = prev
  }
  return cur
}

/** 和弦组内最后一个 `<note>`（其后为下一发音点或非 chord 的 note） */
export function chordTailNote(head: Element): Element {
  let cur = head
  let next = cur.nextElementSibling
  while (next?.localName === 'note' && isChordNote(next)) {
    cur = next
    next = cur.nextElementSibling
  }
  return cur
}

/**
 * 在 `tail` 之后插入 `<direction>` 时的插入参照节点：
 * 跳过和弦后续 `<note>`，再跳过已存在的、由 `skipDirection` 判定的本应用 `<direction>`，以便多条标注重叠在同一锚点附近时顺序追加。
 */
export function insertionRefAfterNoteGroup(
  tail: Element,
  skipDirection?: (el: Element) => boolean,
): Element | null {
  let s: Element | null = tail.nextElementSibling
  while (s && s.localName === 'note' && isChordNote(s)) {
    s = s.nextElementSibling
  }
  while (s && skipDirection?.(s)) {
    s = s.nextElementSibling
  }
  return s
}

/**
 * `score-partwise` 下按文档顺序排列的各 `<part>` 元素（P1、P2…）。
 */
export function listScorePartElements(doc: Document): Element[] {
  const root = doc.documentElement
  if (!root || root.localName !== 'score-partwise') return []
  return Array.from(root.children).filter((el) => el.localName === 'part')
}

/**
 * 构建指定 `<part>` 的音符时间轴（tick 与 `buildFirstPartNoteTimeline` 同一累加规则，便于跨 part 对齐 anchorTick）。
 */
export function buildPartNoteTimeline(doc: Document, partIndex0: number): TimedNoteEl[] {
  const parts = listScorePartElements(doc)
  const part = parts[Math.max(0, Math.min(parts.length - 1, Math.round(partIndex0)))]
  if (!part) return []
  const measures = Array.from(part.children).filter((el) => el.localName === 'measure')
  const out: TimedNoteEl[] = []
  let runningTick = 0

  for (const measure of measures) {
    let cursor = 0
    let lastNoteStart = 0
    let measureMax = 0

    for (const child of Array.from(measure.children)) {
      const name = child.localName
      if (name === 'backup') {
        const dur = Number(child.querySelector('duration')?.textContent ?? 0)
        if (Number.isFinite(dur) && dur > 0) cursor = Math.max(0, cursor - dur)
        continue
      }
      if (name === 'forward') {
        const dur = Number(child.querySelector('duration')?.textContent ?? 0)
        if (Number.isFinite(dur) && dur > 0) {
          cursor += dur
          measureMax = Math.max(measureMax, cursor)
        }
        continue
      }
      if (name !== 'note') continue

      const isChord = !!child.querySelector(':scope > chord')
      const dur = Number(child.querySelector('duration')?.textContent ?? 0)
      const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 0
      const start = isChord ? lastNoteStart : cursor
      const end = start + safeDur
      if (!isChord) {
        lastNoteStart = cursor
        cursor += safeDur
      }
      measureMax = Math.max(measureMax, cursor, end)
      out.push({
        measure,
        note: child,
        tickStart: runningTick + start,
        tickEnd: runningTick + end,
        divisionsFromMeasureStart: start,
      })
    }
    runningTick += Math.max(1, Math.floor(measureMax))
  }
  return out
}

/**
 * 遍历首个 `<part>` 下各小节，按 MusicXML divisions 语义累计 tick，列出每颗音符（含和弦内各 note 元素）。
 */
export function buildFirstPartNoteTimeline(doc: Document): TimedNoteEl[] {
  return buildPartNoteTimeline(doc, 0)
}

/**
 * 按锚点 tick 选择「时间上最近」的 `<note>` 元素（优先落在 [tickStart, tickEnd) 内）。
 */
export function pickTimedNoteForAnchorTick(timeline: TimedNoteEl[], anchorTick: number): TimedNoteEl | null {
  if (!timeline.length || !Number.isFinite(anchorTick)) return null
  for (const t of timeline) {
    if (anchorTick >= t.tickStart && anchorTick < t.tickEnd) return t
  }
  let best: TimedNoteEl | null = null
  let bestD = Infinity
  for (const t of timeline) {
    const mid = (t.tickStart + t.tickEnd) / 2
    const d = Math.abs(anchorTick - mid)
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

/** 仅保留和弦头对应的 timeline 项（与 `chordHeadNote` 一致） */
export function listChordHeadTimedNotesInMeasure(timeline: TimedNoteEl[], measure: Element): TimedNoteEl[] {
  return timeline.filter((t) => t.measure === measure && t.note === chordHeadNote(t.note))
}

function staffNumberForNote(note: Element): number {
  const s = Number(note.querySelector(':scope > staff')?.textContent?.trim())
  return Number.isFinite(s) && s > 0 ? Math.floor(s) : 1
}

function voiceNumberForNote(note: Element): number {
  const v = Number(note.querySelector(':scope > voice')?.textContent?.trim())
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1
}

/**
 * 在「已确定小节下标」的前提下，用 tick + 视口 y（映射到 staff）+ x 在**该小节内**选出和弦头，
 * 修复仅用小节首音或 `pickTimedNoteForAnchorTick` 首条命中时，同拍多 staff 并绑到同一 `<note>` 的问题。
 */
function pickTimedNoteInStoredMeasure(
  ann: { x: number; y?: number; anchorTickStart?: number | null },
  timeline: TimedNoteEl[],
  measures: Element[],
  measureIndex0: number,
): TimedNoteEl | null {
  const measureEl = measures[measureIndex0]
  if (!measureEl) return null
  const heads = listChordHeadTimedNotesInMeasure(timeline, measureEl)
  if (!heads.length) {
    const any = timeline.filter((t) => t.measure === measureEl)
    return any[0] ?? null
  }

  const rawTick = ann.anchorTickStart
  let pool = heads
  if (rawTick != null && Number.isFinite(rawTick)) {
    const at = rawTick as number
    const direct = heads.filter((h) => at >= h.tickStart && at < h.tickEnd)
    if (direct.length) {
      pool = direct
    } else {
      let bestMid = heads[0]!
      let bestD = Infinity
      for (const h of heads) {
        const mid = (h.tickStart + h.tickEnd) / 2
        const d = Math.abs(at - mid)
        if (d < bestD) {
          bestD = d
          bestMid = h
        }
      }
      const midRef = (bestMid.tickStart + bestMid.tickEnd) / 2
      pool = heads.filter((h) => Math.abs((h.tickStart + h.tickEnd) / 2 - midRef) <= bestD + 1e-6)
    }
  }

  if (pool.length === 1) return pool[0]!

  const nx = Math.max(0, Math.min(1, Number.isFinite(ann.x) ? ann.x : 0.5))
  const ny = Math.max(0, Math.min(1, Number.isFinite(ann.y) ? (ann.y as number) : 0.5))
  const nyStaff = inkNormalizedYForPartPick(ny)

  const sameDiv = pool[0]!.divisionsFromMeasureStart
  const allSameDiv = pool.every((h) => h.divisionsFromMeasureStart === sameDiv)
  if (allSameDiv) {
    const scored = pool.map((h) => ({
      h,
      sn: staffNumberForNote(h.note),
      vn: voiceNumberForNote(h.note),
    }))
    scored.sort((a, b) => (a.sn !== b.sn ? a.sn - b.sn : a.vn - b.vn))
    const sns = scored.map((s) => s.sn)
    const minS = Math.min(...sns)
    const maxS = Math.max(...sns)
    const span = Math.max(1, maxS - minS)
    /** 视口 ny：0=页面上缘 → 对应谱表上方（MusicXML 通常 staff 编号较小） */
    const targetStaff = minS + nyStaff * span
    const ties = scored.filter((s) => Math.abs(s.sn - targetStaff) === Math.min(...scored.map((x) => Math.abs(x.sn - targetStaff))))
    if (ties.length === 1) return ties[0]!.h
    const tiesSorted = [...ties].sort((a, b) => a.vn - b.vn)
    const vj = Math.min(tiesSorted.length - 1, Math.max(0, Math.floor(nx * tiesSorted.length)))
    return tiesSorted[vj]!.h
  }

  const sorted = [...pool].sort((a, b) => a.divisionsFromMeasureStart - b.divisionsFromMeasureStart)
  if (rawTick != null && Number.isFinite(rawTick)) {
    const at = rawTick as number
    return [...sorted].sort((a, b) => {
      const ma = (a.tickStart + a.tickEnd) / 2
      const mb = (b.tickStart + b.tickEnd) / 2
      return Math.abs(at - ma) - Math.abs(at - mb)
    })[0]!
  }
  const j = Math.min(sorted.length - 1, Math.max(0, Math.floor(nx * sorted.length)))
  return sorted[j]!
}

/** 渲染引擎某一页在首声部 `<measure>` 列表中的 0-based 闭区间（与 OSMD `measureListIndex` 对齐） */
export type RendererPageMeasureBounds = { start: number; end: number }

/**
 * OSMD 引擎在渲染时给出的、各小节在「整页 root SVG getBBox() 墨迹宽度」上的归一化水平区间，
 * 与 `ScorePinchViewport` 里 `clientToMusicNormXInContainer` 得到的 `ann.x` 同一参照。
 */
/** OSMD 每页上单个 MusicSystem 的墨迹归一化纵向范围（与 `ann.y` / ink span 同一参照） */
export type OsmdMusicSystemNormBounds = {
  top: number
  bottom: number
}

export type OsmdInkNormMeasureSpan = {
  measureListIndex: number
  left: number
  right: number
  /** 墨迹归一化纵坐标 [0,1]，与 `ScorePinchViewport` 中 `ann.y` 同一参照；缺省时仅按横坐标命中（旧缓存） */
  top?: number
  bottom?: number
  /**
   * 与 MusicXML `score-partwise` 下 `<part>` 文档顺序一致的 0-based 下标（OSMD Instrument.IdString 映射）。
   * 总谱多 part 时用于区分同一小节列上不同乐器行的 ink 命中。
   */
  partIndex0?: number
}

/**
 * 渲染页 `page1Based`（1-based）在首声部中对应的小节下标闭区间 [start, end]（0-based）。
 * 若传入 `rendererPageMeasureBounds`（与 OSMD 实际分页一致）则优先使用；否则按 `M/totalPages` 均分。
 */
export function measureIndexRangeForRendererPage(
  page1Based: number,
  totalPages: number,
  totalMeasures: number,
  rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null,
): { start: number; end: number } {
  const M = Math.max(0, totalMeasures)
  if (M <= 0) return { start: 0, end: 0 }
  const tp = Math.max(1, totalPages)
  const p = Math.max(1, Math.min(tp, Math.round(Number(page1Based))))
  const b = rendererPageMeasureBounds?.[p - 1]
  if (
    b &&
    Number.isFinite(b.start) &&
    Number.isFinite(b.end) &&
    b.end >= b.start &&
    b.start >= 0 &&
    b.end < M
  ) {
    return { start: b.start, end: b.end }
  }
  const startExclusive = Math.floor(((p - 1) * M) / tp)
  const endExclusive = Math.floor((p * M) / tp)
  const start = Math.min(M - 1, Math.max(0, startExclusive))
  const end = Math.max(start, Math.min(M - 1, Math.max(start, endExclusive - 1)))
  return { start, end }
}

/** 无 OSMD 边界时与均分左端一致；有边界时取该页首小节下标 */
export function mapRendererPageToFirstMeasureIndex(
  page: number,
  totalPages: number,
  totalMeasures: number,
  rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null,
): number {
  return measureIndexRangeForRendererPage(page, totalPages, totalMeasures, rendererPageMeasureBounds).start
}

/**
 * 无 MIDI/Verovio 锚点 tick 时，用「当前渲染页 + 归一化横坐标」映射到小节与和弦头音符。
 *
 * **旧 bug**：`globalT = (p - 1 + nx) / totalPages` 再 `measFloat = globalT * M` 时，在 **p=1** 上
 * `globalT = nx / totalPages`，于是整页横向只对应全曲最前 `M/totalPages` 个小节；`nx` 接近 1 时
 * 会落到「全曲按页均分」的右缘，而不是**当前画布页**的右缘，和 OSMD 单页上可见的小节不一致，
 * 易把标注锚到错误小节（例如同一屏上已出现印刷小节号 11，XML 却写入 measure 10）。
 *
 * **现逻辑**：在「当前渲染页」对应的小节闭区间内用 `nx` 插值。默认区间按 `M/totalPages` 均分；
 * OSMD 下可传入 `rendererPageMeasureBounds`（由 `renderMusicXmlWithOsmdPages` 从 OSMD 分页图元提取），
 * 避免 MusicXML 印刷页数与 OSMD 渲染页数不一致（如 32 vs 27）时整页错位。
 *
 * 若同时传入 `rendererPageMeasureInkNormSpans`（由 OSMD `getPageMeasureHorizontalLayouts` 按 measure 自身 extent 归一化得到），则横坐标按**真实小节宽度**映射，而不是在页内按小节个数均分，避免宽小节与窄小节并存时锚点偏几小节。
 *
 * **多 system 一页**：各 system 从左起排，不同小节的墨迹区间在归一化横坐标上可能重叠；仅按「第一个包含 nx 的 span」会误选更靠后 system 上的小节（例如点到 m10 却落到 m15）。此时用与 `rendererPageMeasureBounds` 一致的页内线性小节下标 **`miFallback`**，在多个横坐标命中的 span 中取 `measureListIndex` 最接近者（再并列取较小下标）。
 * 若 span 上带有 **`top` / `bottom`**（墨迹归一化纵坐标，与点击 `ann.y` 一致），则优先做 **二维命中**，从重叠的横向区间中区分上下两行 system。
 */
function spanHasVerticalInk(s: OsmdInkNormMeasureSpan): boolean {
  const t = s.top
  const b = s.bottom
  return (
    typeof t === 'number' &&
    typeof b === 'number' &&
    Number.isFinite(t) &&
    Number.isFinite(b) &&
    b > t + 1e-6
  )
}

/** 顶行点击 ny 常贴近 0；略放宽上边界，避免 in2d 为空后退回纯横向而误选下一 system */
const SPAN_NY_TOP_SLACK = 0.045

/**
 * 将视口 ny 映射为「按 part 垂直条带」命中用的纵坐标：标在谱表上方时 ny 常落在下一 part 的条带内（如 P1 与 P2 之间）。
 * 顶部做强上移；自 `taperStart` 起随 ny 增大平滑衰减，至 `taperEnd` 几乎不加偏，避免第三声部（ny≈0.17）被误判为第二 part。
 */
function inkNormalizedYForPartPick(ny: number): number {
  const y = Math.max(0, Math.min(1, ny))
  const maxBias = 0.056
  const taperStart = 0.075
  const taperEnd = 0.195
  let weight = 1
  if (y > taperStart) {
    if (y >= taperEnd) {
      weight = 0
    } else {
      const t = (y - taperStart) / (taperEnd - taperStart)
      const s = t * t * (3 - 2 * t)
      weight = 1 - s
    }
  }
  return Math.max(0, y - maxBias * weight)
}

/**
 * 按纵坐标 ny 选中当前页 MusicSystem（标注锚点 / 视口小节解析）。
 * 标注常落在谱表上方；两 system 之间的空隙应归**下方** system，否则横向墨迹会落到上一行（如第 34 小节误绑到第 1 行）。
 */
export function pickMusicSystemIndexForViewportAnchor(
  ny: number,
  systems: OsmdMusicSystemNormBounds[] | null | undefined,
): number {
  if (!systems?.length) return 0
  if (systems.length === 1) return 0
  const y = Math.max(0, Math.min(1, ny))
  for (let i = 0; i < systems.length; i += 1) {
    const s = systems[i]!
    if (y >= s.top - 1e-6 && y <= s.bottom + 1e-6) return i
  }
  for (let i = 0; i < systems.length - 1; i += 1) {
    const cur = systems[i]!
    const next = systems[i + 1]!
    if (y > cur.bottom + 1e-6 && y < next.top - 1e-6) return i + 1
  }
  if (y < systems[0]!.top - 1e-6) return 0
  const last = systems.length - 1
  if (y > systems[last]!.bottom + 1e-6) return last
  let bestI = 0
  let bestD = Number.POSITIVE_INFINITY
  for (let i = 0; i < systems.length; i += 1) {
    const s = systems[i]!
    const mid = (s.top + s.bottom) / 2
    const d = Math.abs(y - mid)
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && i > bestI)) {
      bestD = d
      bestI = i
    }
  }
  return bestI
}

/** 仅保留落在指定 MusicSystem 纵向条带内的 ink span。 */
function filterInkSpansToMusicSystem(
  inkSpans: OsmdInkNormMeasureSpan[],
  system: OsmdMusicSystemNormBounds,
): OsmdInkNormMeasureSpan[] {
  const eps = 1e-5
  const filtered = inkSpans.filter((s) => {
    if (!spanHasVerticalInk(s)) return false
    const mid = ((s.top as number) + (s.bottom as number)) / 2
    return mid >= system.top - eps && mid <= system.bottom + eps
  })
  return filtered.length > 0 ? filtered : inkSpans
}

/**
 * 将 system 内小节墨迹映射到 [0,1] 局部横坐标，并返回该 system 在页内墨迹上的 left/span，
 * 供将页级 nx 换算为 system 内 nxLocal。
 */
function remapInkSpansToSystemLocalNorm(spans: OsmdInkNormMeasureSpan[]): {
  spans: OsmdInkNormMeasureSpan[]
  inkLeft: number
  inkSpan: number
} {
  if (!spans.length) return { spans: [], inkLeft: 0, inkSpan: 1 }
  const inkLeft = Math.min(...spans.map((s) => s.left))
  const inkRight = Math.max(...spans.map((s) => s.right))
  const inkSpan = Math.max(0.02, inkRight - inkLeft)
  return {
    inkLeft,
    inkSpan,
    spans: spans.map((s) => ({
      ...s,
      left: (s.left - inkLeft) / inkSpan,
      right: (s.right - inkLeft) / inkSpan,
    })),
  }
}

function spanContainsNormPoint(s: OsmdInkNormMeasureSpan, nx: number, ny: number): boolean {
  if (!(nx >= s.left && nx <= s.right)) return false
  if (!spanHasVerticalInk(s)) return false
  const t = s.top as number
  const b = s.bottom as number
  const topBound = ny < 0.14 ? t - SPAN_NY_TOP_SLACK : t
  return ny >= topBound && ny <= b
}

function horizontalDistanceToSpan(s: OsmdInkNormMeasureSpan, nx: number): number {
  return nx < s.left ? s.left - nx : nx > s.right ? nx - s.right : 0
}

function verticalDistanceToSpanInk(s: OsmdInkNormMeasureSpan, ny: number): number {
  if (!spanHasVerticalInk(s)) return 0.5
  const t = s.top as number
  const b = s.bottom as number
  if (ny < t) return t - ny
  if (ny > b) return ny - b
  return 0
}

export type ViewportTimedNotePick = {
  picked: TimedNoteEl | null
  /** OSMD ink 命中条带上的 `<part>` 下标；缺省视为 0（首 part） */
  anchorXmlPartIndex0?: number
}

export function pickTimedNoteForViewportPlacement(
  ann: { page: number; x: number; y?: number },
  timeline: TimedNoteEl[],
  measures: Element[],
  totalPages: number,
  rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null,
  rendererPageMeasureInkNormSpans?: OsmdInkNormMeasureSpan[][] | null,
  rendererPageMusicSystemNormBounds?: OsmdMusicSystemNormBounds[][] | null,
): ViewportTimedNotePick {
  if (!timeline.length || !measures.length) return { picked: null }
  const M = measures.length
  const tp = Math.max(1, totalPages)
  const p = Math.max(1, Math.min(tp, Math.round(Number(ann.page))))
  const nx = Math.max(0, Math.min(1, Number.isFinite(ann.x) ? ann.x : 0.5))
  const ny = Math.max(0, Math.min(1, Number.isFinite(ann.y) ? (ann.y as number) : 0.5))
  /** 与 `inkNormalizedYForPartPick` 一致：用于墨迹条带命中 */
  const nyInk = inkNormalizedYForPartPick(ny)

  const { start, end } = measureIndexRangeForRendererPage(p, tp, M, rendererPageMeasureBounds ?? null)
  let measureRangeStart = start
  let measureRangeEnd = end
  let nxPick = nx

  const pageInkSpans = rendererPageMeasureInkNormSpans?.[p - 1]
  const pageSystems = rendererPageMusicSystemNormBounds?.[p - 1]
  let inkSpans = pageInkSpans
  if (pageInkSpans?.length && pageSystems?.length) {
    // MusicSystem 用原始 ny：inkNormalizedYForPartPick 为同 system 内多 part 消歧会上拉 y，
    // 第二行点击（ny≈0.10）若用 nyInk（≈0.05）会误落第一行（如 m15 与 m36 同列 nx）。
    const sysIdx = pickMusicSystemIndexForViewportAnchor(ny, pageSystems)
    const system = pageSystems[sysIdx]!
    const sysFiltered = filterInkSpansToMusicSystem(pageInkSpans, system)
    if (sysFiltered.length) {
      const { spans: localSpans, inkLeft, inkSpan } = remapInkSpansToSystemLocalNorm(sysFiltered)
      inkSpans = localSpans
      nxPick = Math.max(0, Math.min(1, (nx - inkLeft) / inkSpan))
      const mis = sysFiltered.map((s) => s.measureListIndex)
      measureRangeStart = Math.min(...mis)
      measureRangeEnd = Math.max(...mis)
    }
  }

  const spanFlo = measureRangeEnd - measureRangeStart
  const continuous = spanFlo > 0 ? measureRangeStart + nxPick * spanFlo : measureRangeStart
  const miFallback = Math.min(measureRangeEnd, Math.max(measureRangeStart, Math.floor(continuous)))

  if (inkSpans?.length) {
    const spanSample = inkSpans.slice(0, 6).map((s) => ({
      mi: s.measureListIndex,
      pi: s.partIndex0,
      l: Number(s.left.toFixed(3)),
      r: Number(s.right.toFixed(3)),
    }))
    const spanLast = inkSpans.length > 6 ? inkSpans[inkSpans.length - 1] : null
    const spanLastInfo = spanLast
      ? {
          mi: spanLast.measureListIndex,
          pi: spanLast.partIndex0,
          l: Number(spanLast.left.toFixed(3)),
          r: Number(spanLast.right.toFixed(3)),
        }
      : null
    annotationDebugLog('pickTimedNoteForViewport:ink', {
      page: p,
      totalPages: tp,
      measuresTotal: M,
      nx: Number(nx.toFixed(4)),
      nxPick: Number(nxPick.toFixed(4)),
      ny: Number(ny.toFixed(4)),
      nyInk: Number(nyInk.toFixed(4)),
      bounds: [start, end],
      measureRange: [measureRangeStart, measureRangeEnd],
      continuous: Number(continuous.toFixed(2)),
      miFallback,
      inkSpanCount: inkSpans.length,
      inkSpanSample: spanSample,
      inkSpanLast: spanLastInfo,
      systemCount: pageSystems?.length ?? 0,
    })
    const fracFromSpan = (s: OsmdInkNormMeasureSpan): number => {
      const w = s.right - s.left
      return w > 1e-9 ? (nxPick - s.left) / w : 0
    }

    const pickSpanFromCandidates = (cands: OsmdInkNormMeasureSpan[]): OsmdInkNormMeasureSpan | null => {
      if (!cands.length) return null
      if (cands.length === 1) return cands[0]!
      return [...cands].sort((a, b) => {
        const da = Math.abs(a.measureListIndex - continuous)
        const db = Math.abs(b.measureListIndex - continuous)
        if (Math.abs(da - db) > 1e-7) return da - db
        if (a.measureListIndex !== b.measureListIndex) return a.measureListIndex - b.measureListIndex
        return (a.partIndex0 ?? 0) - (b.partIndex0 ?? 0)
      })[0]!
    }

    const pickSpanFromHorizontalHitsWithVerticalHelp = (
      cands: OsmdInkNormMeasureSpan[],
      hasVertical: boolean,
      nyPick: number,
    ): OsmdInkNormMeasureSpan | null => {
      if (!cands.length) return null
      if (cands.length === 1) return cands[0]!
      if (!hasVertical) return pickSpanFromCandidates(cands)
      return [...cands].sort((a, b) => {
        const va = verticalDistanceToSpanInk(a, nyPick)
        const vb = verticalDistanceToSpanInk(b, nyPick)
        if (Math.abs(va - vb) > 0.008) return va - vb
        const da = Math.abs(a.measureListIndex - continuous)
        const db = Math.abs(b.measureListIndex - continuous)
        if (Math.abs(da - db) > 1e-7) return da - db
        if (a.measureListIndex !== b.measureListIndex) return a.measureListIndex - b.measureListIndex
        return (a.partIndex0 ?? 0) - (b.partIndex0 ?? 0)
      })[0]!
    }

    const hasAnyVertical = inkSpans.some(spanHasVerticalInk)
    const in2d = hasAnyVertical ? inkSpans.filter((s) => spanContainsNormPoint(s, nxPick, nyInk)) : []
    const inX = inkSpans.filter((s) => nxPick >= s.left && nxPick <= s.right)
    let chosen: OsmdInkNormMeasureSpan | null = null
    if (in2d.length) {
      chosen = pickSpanFromCandidates(in2d)
    } else if (inX.length) {
      chosen = pickSpanFromHorizontalHitsWithVerticalHelp(inX, hasAnyVertical, nyInk)
    } else {
      let bestDist = Infinity
      const ties: OsmdInkNormMeasureSpan[] = []
      for (const s of inkSpans) {
        const dx = horizontalDistanceToSpan(s, nxPick)
        const dy =
          hasAnyVertical && spanHasVerticalInk(s)
            ? nyInk < (s.top as number)
              ? (s.top as number) - nyInk
              : nyInk > (s.bottom as number)
                ? nyInk - (s.bottom as number)
                : 0
            : 0
        const d = dx + dy * 2.2
        if (d < bestDist) {
          bestDist = d
          ties.length = 0
          ties.push(s)
        } else if (d === bestDist) {
          ties.push(s)
        }
      }
      chosen = pickSpanFromCandidates(ties)
    }

    const spanPart = chosen?.partIndex0
    if (chosen) {
      const mi = chosen.measureListIndex
      annotationDebugLog('pickTimedNoteForViewport:hit', {
        mi,
        partIndex0: spanPart,
        left: Number(chosen.left.toFixed(3)),
        right: Number(chosen.right.toFixed(3)),
        fracInMeas: Number(fracFromSpan(chosen).toFixed(3)),
        miFallback,
        in2d: in2d.length,
        inX: inX.length,
      })
      let fracInMeas = fracFromSpan(chosen)
      fracInMeas = Math.max(0, Math.min(1, fracInMeas))
      if (mi >= 0 && mi < M) {
        const measureEl = measures[mi]!
        const heads = listChordHeadTimedNotesInMeasure(timeline, measureEl)
        if (!heads.length) {
          const any = timeline.filter((t) => t.measure === measureEl)
          return { picked: any[0] ?? null, anchorXmlPartIndex0: spanPart }
        }
        const j = Math.min(heads.length - 1, Math.max(0, Math.floor(fracInMeas * heads.length)))
        return { picked: heads[j] ?? heads[0], anchorXmlPartIndex0: spanPart }
      }
    }
  }

  const mi = miFallback
  annotationDebugLog('pickTimedNoteForViewport:fallback', {
    mi,
    fracInMeas: Number((continuous - mi).toFixed(3)),
  })
  const fracInMeas = continuous - mi

  const measureEl = measures[mi]!
  const heads = listChordHeadTimedNotesInMeasure(timeline, measureEl)
  if (!heads.length) {
    const any = timeline.filter((t) => t.measure === measureEl)
    return { picked: any[0] ?? null }
  }
  const j = Math.min(heads.length - 1, Math.max(0, Math.floor(fracInMeas * heads.length)))
  return { picked: heads[j] ?? heads[0] }
}

/** 标注锚点音符：与点击解析、MusicXML 导出共用同一套决策顺序。 */
export type AnnotationTimedNotePickSource = 'stored-anchor' | 'viewport'

/**
 * 点击存盘与导出共用的「选哪颗音」逻辑：
 * 1. 若存在有效的 `anchorMeasureListIndex0`：在该小节内用 tick + `y`（同拍多 staff 时按 `<staff>` 与归一化纵坐标消歧），
 *    不再一律绑定小节内第一颗 `<note>`（否则同列多 staff 会并绑）。若同时存在有效 tick 且 tick 命中的音符落在**别的小节**（谱面漂移），回退全页视口。
 * 2. 否则若存在有效的 `anchorTickStart`：`pickTimedNoteForAnchorTick`。
 * 3. 否则 `pickTimedNoteForViewportPlacement`（`page` + `x`/`y` + 可选 OSMD bounds / ink spans）。
 */
export function pickTimedNoteForAnnotationRecord(
  ann: {
    page: number
    x: number
    y?: number
    anchorTickStart?: number | null
    anchorMeasureListIndex0?: number | null
    anchorXmlPartIndex0?: number | null
  },
  timeline: TimedNoteEl[],
  measures: Element[],
  totalPages: number,
  rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null,
  rendererPageMeasureInkNormSpans?: OsmdInkNormMeasureSpan[][] | null,
  rendererPageMusicSystemNormBounds?: OsmdMusicSystemNormBounds[][] | null,
): { picked: TimedNoteEl | null; source: AnnotationTimedNotePickSource; anchorXmlPartIndex0?: number } {
  const passPart = (): number | undefined =>
    ann.anchorXmlPartIndex0 != null &&
    Number.isFinite(ann.anchorXmlPartIndex0) &&
    (ann.anchorXmlPartIndex0 as number) >= 0
      ? Math.round(ann.anchorXmlPartIndex0 as number)
      : undefined

  const rawMi = ann.anchorMeasureListIndex0
  if (rawMi != null && Number.isFinite(rawMi) && rawMi >= 0 && rawMi < measures.length && measures.length > 0) {
    const mi = Math.round(rawMi)
    const targetMeasure = measures[mi]
    if (targetMeasure) {
      const rawTick = ann.anchorTickStart
      if (rawTick != null && Number.isFinite(rawTick) && timeline.length > 0) {
        const tickHit = pickTimedNoteForAnchorTick(timeline, rawTick as number)
        if (tickHit && tickHit.measure !== targetMeasure) {
          const vp = pickTimedNoteForViewportPlacement(
            ann,
            timeline,
            measures,
            totalPages,
            rendererPageMeasureBounds ?? null,
            rendererPageMeasureInkNormSpans ?? null,
            rendererPageMusicSystemNormBounds ?? null,
          )
          return {
            picked: vp.picked,
            source: 'viewport',
            ...(vp.anchorXmlPartIndex0 !== undefined ? { anchorXmlPartIndex0: vp.anchorXmlPartIndex0 } : {}),
          }
        }
      }

      const refined = pickTimedNoteInStoredMeasure(ann, timeline, measures, mi)
      if (refined) {
        const p = passPart()
        return { picked: refined, source: 'stored-anchor', ...(p !== undefined ? { anchorXmlPartIndex0: p } : {}) }
      }

      const firstNote = targetMeasure.querySelector(':scope > note')
      if (firstNote) {
        const timedNote =
          timeline.find((t) => t.note === firstNote) ??
          ({ note: firstNote, measure: targetMeasure, tickStart: 0, tickEnd: 0, divisionsFromMeasureStart: 0 } as TimedNoteEl)
        const p = passPart()
        return { picked: timedNote, source: 'stored-anchor', ...(p !== undefined ? { anchorXmlPartIndex0: p } : {}) }
      }
      const p = passPart()
      return { picked: null, source: 'stored-anchor', ...(p !== undefined ? { anchorXmlPartIndex0: p } : {}) }
    }
  }

  // 第二优先级：anchorTickStart（也必须显式判空，Number(null) = 0 会错误命中第一颗音符）
  const rawTick = ann.anchorTickStart
  if (rawTick != null && Number.isFinite(rawTick) && timeline.length > 0) {
    const tickHit = pickTimedNoteForAnchorTick(timeline, rawTick as number)
    if (tickHit) {
      const p = passPart()
      return { picked: tickHit, source: 'stored-anchor', ...(p !== undefined ? { anchorXmlPartIndex0: p } : {}) }
    }
  }

  // 兜底：视口估算
  const vp = pickTimedNoteForViewportPlacement(
    ann,
    timeline,
    measures,
    totalPages,
    rendererPageMeasureBounds ?? null,
    rendererPageMeasureInkNormSpans ?? null,
    rendererPageMusicSystemNormBounds ?? null,
  )
  return {
    picked: vp.picked,
    source: 'viewport',
    ...(vp.anchorXmlPartIndex0 !== undefined ? { anchorXmlPartIndex0: vp.anchorXmlPartIndex0 } : {}),
  }
}

/**
 * 单小节内最后一个事件后的 divisions 位置（用于无锚点时把 direction 落在小节末尾的 offset）。
 */
export function getMeasureEndDivisions(measure: Element): number {
  let cursor = 0
  let lastNoteStart = 0
  let measureMax = 0
  for (const child of Array.from(measure.children)) {
    const name = child.localName
    if (name === 'backup') {
      const dur = Number(child.querySelector('duration')?.textContent ?? 0)
      if (Number.isFinite(dur) && dur > 0) cursor = Math.max(0, cursor - dur)
      continue
    }
    if (name === 'forward') {
      const dur = Number(child.querySelector('duration')?.textContent ?? 0)
      if (Number.isFinite(dur) && dur > 0) {
        cursor += dur
        measureMax = Math.max(measureMax, cursor)
      }
      continue
    }
    if (name !== 'note') continue
    const isChord = !!child.querySelector(':scope > chord')
    const dur = Number(child.querySelector('duration')?.textContent ?? 0)
    const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 0
    const start = isChord ? lastNoteStart : cursor
    const end = start + safeDur
    if (!isChord) {
      lastNoteStart = cursor
      cursor += safeDur
    }
    measureMax = Math.max(measureMax, cursor, end)
  }
  return Math.max(0, Math.floor(measureMax))
}

/** 全曲和弦头音符按时间排序（用于导出时错开重复锚点） */
export function orderedChordHeadsFromTimeline(timeline: TimedNoteEl[]): TimedNoteEl[] {
  return timeline
    .filter((t) => t.note === chordHeadNote(t.note))
    .sort((a, b) => {
      if (a.tickStart !== b.tickStart) return a.tickStart - b.tickStart
      if (a.tickEnd !== b.tickEnd) return a.tickEnd - b.tickEnd
      return 0
    })
}

/**
 * 多条标注定到同一颗和弦头时，从候选起沿时间轴**仅向前**顺延到下一个未占用的和弦头，
 * 避免都落在小节最后一个 `insertBefore(..., null)` 式追加而挤在 `</measure>` 末尾。
 *
 * **不得**使用模运算绕回时间轴开头：若用 `(startIdx + k) % len`，在候选之后已无空闲头时会误选全曲最前面的头，
 * 从而把 `<direction>` 插到错误小节（与视口所选相差甚远）。
 */
export function spreadTimedNotePickForExport(
  headsOrdered: TimedNoteEl[],
  usedHeadNotes: Set<Element>,
  candidate: TimedNoteEl | null,
): TimedNoteEl | null {
  if (!candidate || !headsOrdered.length) return candidate
  const headEl = chordHeadNote(candidate.note)
  let startIdx = headsOrdered.findIndex((h) => h.note === headEl)
  if (startIdx < 0) {
    startIdx = headsOrdered.findIndex((h) => h.tickStart >= candidate.tickStart)
    if (startIdx < 0) startIdx = 0
  }
  // 限制在同一个 measure 内顺延，避免跨小节跳到错误位置
  const candidateMeasure = candidate.measure
  for (let k = 0; k < headsOrdered.length - startIdx; k++) {
    const h = headsOrdered[startIdx + k]!
    // 如果已经跨出了原始小节，停止顺延
    if (candidateMeasure && h.measure !== candidateMeasure) break
    if (!usedHeadNotes.has(h.note)) {
      usedHeadNotes.add(h.note)
      return h
    }
  }
  return candidate
}

/** 小节是否以 `<print new-page="yes">` 开始新页（与 Sibelius / MuseScore 分页一致） */
export function measureStartsNewPage(measure: Element): boolean {
  for (const child of Array.from(measure.children)) {
    if (child.localName !== 'print') continue
    if (child.getAttribute('new-page') === 'yes' || child.getAttribute('newPage') === 'yes') return true
  }
  return false
}

/** 首声部 `<part>` 内按 `<print new-page>` 划分的总印刷页数（至少为 1） */
export function countPrintedPagesFirstPart(measures: Element[]): number {
  if (!measures.length) return 1
  let c = 1
  for (let i = 1; i < measures.length; i++) {
    if (measureStartsNewPage(measures[i]!)) c += 1
  }
  return c
}

/**
 * 印刷页 `printedPage1Based`（1-based）在首声部中对应的小节下标闭区间 [start, end]（0-based）。
 * 与 `printedPageIndexForPartMeasure` 使用同一套 new-page 规则。
 */
export function measureIndexRangeForPrintedPage(
  measures: Element[],
  printedPage1Based: number,
): { start: number; end: number } {
  if (!measures.length) return { start: 0, end: 0 }
  const starts: number[] = [0]
  for (let i = 1; i < measures.length; i++) {
    if (measureStartsNewPage(measures[i]!)) starts.push(i)
  }
  const pp = Math.max(1, starts.length)
  const p = Math.max(1, Math.min(pp, Math.round(Number(printedPage1Based))))
  const pageIdx = p - 1
  const start = starts[pageIdx] ?? 0
  const nextStart = pageIdx + 1 < starts.length ? starts[pageIdx + 1]! : measures.length
  const end = Math.max(start, Math.min(measures.length - 1, nextStart - 1))
  return { start, end }
}

/**
 * 首声部第 `measureIndex0` 小节在印刷版式中的页码（1-based），由 `<print new-page>` 累计。
 * 用于无 `fls:page` 时与 MuseScore 等软件对齐。
 */
export function printedPageIndexForPartMeasure(measures: Element[], measureIndex0: number): number {
  const mi = Math.max(0, Math.min(measures.length - 1, measureIndex0))
  let page = 1
  for (let i = 1; i <= mi; i += 1) {
    if (measureStartsNewPage(measures[i]!)) page += 1
  }
  return Math.max(1, page)
}

/**
 * 点击时解析锚点：内部走 `pickTimedNoteForAnnotationRecord` 且**忽略**已存锚点字段（等价于仅视口几何），
 * 得到 `tickStart` / `measureIndex0` 写入 `anchorTickStart` / `anchorMeasureListIndex0`；与导出共用同一实现。
 *
 * @param musicXml 与导出用谱一致（通常为已 `stripAnnotationArtifacts` 的首声部 MusicXML）
 * @param totalPages 当前渲染总页数，须与导出 `options.totalPages` 一致（如 `pagesSvg.length`）
 * @param rendererPageMeasureBounds 可选；与 `renderMusicXmlWithOsmdPages` 返回的每页小节闭区间一致
 * @param rendererPageMeasureInkNormSpans 可选；与渲染时 OSMD 小节水平几何一致（墨迹宽度归一化）
 */
export function resolveViewportAnnotationAnchorOnScoreXml(
  musicXml: string,
  ann: { page: number; x: number; y?: number },
  totalPages: number,
  rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null,
  rendererPageMeasureInkNormSpans?: OsmdInkNormMeasureSpan[][] | null,
  rendererPageMusicSystemNormBounds?: OsmdMusicSystemNormBounds[][] | null,
): { tickStart: number; measureIndex0: number; anchorXmlPartIndex0: number } | null {
  const raw = musicXml?.trim()
  if (!raw) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(raw.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml')
  if (doc.querySelector('parsererror')) return null
  const root = doc.documentElement
  if (!root || root.localName !== 'score-partwise') return null
  const part = Array.from(root.children).find((el) => el.localName === 'part') as Element | undefined
  if (!part) return null
  const measures = Array.from(part.children).filter((el) => el.localName === 'measure')
  if (!measures.length) return null
  const timeline = buildFirstPartNoteTimeline(doc)
  if (!timeline.length) return null
  const r = pickTimedNoteForAnnotationRecord(
    { ...ann, anchorTickStart: null, anchorMeasureListIndex0: null },
    timeline,
    measures,
    Math.max(1, totalPages),
    rendererPageMeasureBounds ?? null,
    rendererPageMeasureInkNormSpans ?? null,
    rendererPageMusicSystemNormBounds ?? null,
  )
  if (!r.picked) return null
  const measureIndex0 = measures.indexOf(r.picked.measure)
  if (measureIndex0 < 0) return null
  return {
    tickStart: r.picked.tickStart,
    measureIndex0,
    anchorXmlPartIndex0: r.anchorXmlPartIndex0 ?? 0,
  }
}

export function estimateAnchorTickFromViewportOnScoreXml(
  musicXml: string,
  ann: { page: number; x: number; y?: number },
  totalPages: number,
  rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null,
  rendererPageMeasureInkNormSpans?: OsmdInkNormMeasureSpan[][] | null,
  rendererPageMusicSystemNormBounds?: OsmdMusicSystemNormBounds[][] | null,
): number | null {
  return resolveViewportAnnotationAnchorOnScoreXml(
    musicXml,
    ann,
    totalPages,
    rendererPageMeasureBounds ?? null,
    rendererPageMeasureInkNormSpans ?? null,
    rendererPageMusicSystemNormBounds ?? null,
  )?.tickStart ?? null
}
