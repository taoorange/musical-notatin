/**
 * 将播放指示线的水平位置对齐到 Verovio SVG 内五线谱区域（通常略过左侧乐器名留白）。
 *
 * 在 `.score-pages--page` 容器内查找 `.score-pinch-viewport svg`，优先用所有「谱表行」
 *（Verovio：`g.staff`；VexFlow/OSMD：`g.vf-stave`）的包围盒合并得到左右边界；若无则回退到 `g.score`。
 */
export interface PlaybackStaffHorizontalRange {
  /** 指示线起点（progress=0）相对容器宽度的比例 [0,1] */
  startRatio: number
  /** progress 从 0→1 时水平扫过的宽度占容器宽度的比例 (0,1] */
  spanRatio: number
}

export interface PlaybackSystemLayout extends PlaybackStaffHorizontalRange {
  /** 指示线相对坐标宿主（coordsHost）的顶部距离（px） */
  topPx: number
  /** 指示线相对坐标宿主（coordsHost）的底部距离（px） */
  bottomPx: number
  /** 墨迹归一化纵向上沿 [0,1]（OSMD MusicSystem；与 ink span / ann.y 一致） */
  nyTop?: number
  /** 墨迹归一化纵向下沿 [0,1] */
  nyBottom?: number
  /** 当前 system 在页内墨迹横向区间 [0,1]（与 OSMD ink span 一致，视口无关） */
  inkLeft?: number
  /** 当前 system 墨迹横向跨度 (0,1] */
  inkSpan?: number
}

/** 页内墨迹区 client 包围盒（与 OSMD ink / ann.x 同一墨迹范围） */
export type PageMusicInkClientRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface MeasurePlaybackSystemsLayoutOptions {
  /** OSMD 渲染时采集的每页 MusicSystem 纵向范围；优先于 DOM 间距聚类 */
  systemNormBounds?: Array<{ top: number; bottom: number }>
}

/** Verovio：`g.staff`；旧版 VexFlow/OSMD：`g.vf-stave` */
const STAFF_LIKE_SELECTOR = 'g.staff, g.vf-stave'
/** 当前 @taotao-lib/opensheetmusicdisplay 分页 SVG 使用 `g.vf-measure`（无 `vf-stave`） */
const OSMD_MEASURE_SELECTOR = 'g.vf-measure'

function queryStaffLikeGroups(root: Element | SVGSVGElement): SVGGElement[] {
  return Array.from(root.querySelectorAll<SVGGElement>(STAFF_LIKE_SELECTOR))
}

/**
 * 纵向分 system / 行高：优先完整谱表 `g.staff`/`g.vf-stave`。
 * `g.vf-measure` 的 getBBox 往往只是一行谱表或局部音符区，不能代表连谱 system 高度。
 */
function queryVerticalBandElements(root: Element | SVGSVGElement): SVGGElement[] {
  const staff = queryStaffLikeGroups(root).filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 2 && r.height >= MIN_VERTICAL_STAFF_BAND_HEIGHT_PX
  })
  if (staff.length >= 2) return staff
  if (staff.length === 1) return staff
  return Array.from(root.querySelectorAll<SVGGElement>(OSMD_MEASURE_SELECTOR))
}

/**
 * 水平范围测量：小节级 `g.vf-measure` 更精确；总谱仍以 `g.staff` 为准。
 */
function queryLayoutBandElements(root: Element | SVGSVGElement): SVGGElement[] {
  const staff = queryStaffLikeGroups(root)
  const measures = Array.from(root.querySelectorAll<SVGGElement>(OSMD_MEASURE_SELECTOR))
  if (measures.length > 0) {
    if (staff.length === 0 || measures.length >= staff.length * 2) {
      return measures
    }
  }
  if (staff.length > 0) return staff
  return measures
}

/** 同一水平谱表行上多个小节 stave 片段合并后的行带（client 坐标） */
type StaffLineBand = {
  top: number
  bottom: number
  left: number
  right: number
  elements: SVGGElement[]
}

const STAFF_LINE_MERGE_PX = 12
/** 低于此高度的 g.staff 多为连谱号/括号，不作为谱表行 */
const MIN_VERTICAL_STAFF_BAND_HEIGHT_PX = 24
/** 总谱整页连谱常见谱表行数下限（钢琴双手谱页通常 ≤12 行且块间有大间距） */
const ORCHESTRA_FULL_PAGE_MIN_STAFF_LINES = 8

function effectiveStaffLeftPx(el: SVGGElement, r: DOMRect): number {
  let effectiveLeft = r.left
  const labelEls = el.querySelectorAll<SVGGElement>('g.label, g.labelAbbr')
  if (labelEls.length > 0) {
    let labelMaxRight = Number.NEGATIVE_INFINITY
    labelEls.forEach((lbl) => {
      const lr = lbl.getBoundingClientRect()
      if (lr.width > 1 && lr.height > 1) {
        labelMaxRight = Math.max(labelMaxRight, lr.right)
      }
    })
    if (Number.isFinite(labelMaxRight) && labelMaxRight < r.left + r.width * 0.5) {
      effectiveLeft = labelMaxRight + 2
    }
  }
  return effectiveLeft
}

/** 将同一 Y 高度上的多个 stave/measure 片段合并为一条「谱表行」，避免按小节碎片聚类。 */
function collectStaffLineBands(svg: SVGSVGElement): StaffLineBand[] {
  const bandNodes = queryVerticalBandElements(svg)
  const raw: StaffLineBand[] = []
  bandNodes.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    raw.push({
      top: r.top,
      bottom: r.bottom,
      left: effectiveStaffLeftPx(el, r),
      right: r.right,
      elements: [el],
    })
  })
  if (!raw.length) return []
  raw.sort((a, b) => a.top - b.top)

  const lines: StaffLineBand[] = []
  for (const band of raw) {
    const cur = lines[lines.length - 1]
    if (cur) {
      const curCy = (cur.top + cur.bottom) / 2
      const bandCy = (band.top + band.bottom) / 2
      if (Math.abs(bandCy - curCy) <= STAFF_LINE_MERGE_PX) {
        cur.top = Math.min(cur.top, band.top)
        cur.bottom = Math.max(cur.bottom, band.bottom)
        cur.left = Math.min(cur.left, band.left)
        cur.right = Math.max(cur.right, band.right)
        cur.elements.push(...band.elements)
        continue
      }
    }
    lines.push({
      top: band.top,
      bottom: band.bottom,
      left: band.left,
      right: band.right,
      elements: [...band.elements],
    })
  }
  return lines
}

function inkFrameFromStaffLines(
  lines: StaffLineBand[],
): { top: number; bottom: number; left: number; right: number } | null {
  if (!lines.length) return null
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  lines.forEach((line) => {
    top = Math.min(top, line.top)
    bottom = Math.max(bottom, line.bottom)
    left = Math.min(left, line.left)
    right = Math.max(right, line.right)
  })
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return null
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null
  return { top, bottom, left, right }
}

function verticalPxFromClientBox(
  top: number,
  bottom: number,
  coordsHostRect: DOMRectReadOnly,
): { topPx: number; bottomPx: number } {
  return {
    topPx: Math.max(0, top - coordsHostRect.top),
    bottomPx: Math.max(0, coordsHostRect.bottom - bottom),
  }
}

function normYFromClientY(y: number, ink: { top: number; bottom: number }): number {
  const span = ink.bottom - ink.top || 1
  return Math.max(0, Math.min(1, (y - ink.top) / span))
}

function clientYFromOsmdNormY(normY: number, ink: { top: number; bottom: number }): number {
  const span = ink.bottom - ink.top || 1
  return ink.top + Math.max(0, Math.min(1, normY)) * span
}

function verticalLayoutFromDomLines(
  group: StaffLineBand[],
  ink: { top: number; bottom: number },
  coordsHostRect: DOMRectReadOnly,
): Pick<PlaybackSystemLayout, 'topPx' | 'bottomPx' | 'nyTop' | 'nyBottom'> {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  group.forEach((line) => {
    top = Math.min(top, line.top)
    bottom = Math.max(bottom, line.bottom)
  })
  const { topPx, bottomPx } = verticalPxFromClientBox(top, bottom, coordsHostRect)
  return {
    topPx,
    bottomPx,
    nyTop: normYFromClientY(top, ink),
    nyBottom: normYFromClientY(bottom, ink),
  }
}

function verticalLayoutFromOsmdNorm(
  norm: { top: number; bottom: number },
  ink: { top: number; bottom: number },
  coordsHostRect: DOMRectReadOnly,
): Pick<PlaybackSystemLayout, 'topPx' | 'bottomPx' | 'nyTop' | 'nyBottom'> {
  const clientTop = clientYFromOsmdNormY(norm.top, ink)
  const clientBottom = clientYFromOsmdNormY(norm.bottom, ink)
  const top = Math.min(clientTop, clientBottom)
  const bottom = Math.max(clientTop, clientBottom)
  const { topPx, bottomPx } = verticalPxFromClientBox(top, bottom, coordsHostRect)
  return { topPx, bottomPx, nyTop: norm.top, nyBottom: norm.bottom }
}

function toStaffHorizontalRangeFromBox(
  coordsHostRect: DOMRectReadOnly,
  hostW: number,
  staffLeft: number,
  staffRight: number,
): PlaybackStaffHorizontalRange | null {
  const l = staffLeft
  const r = staffRight
  if (!Number.isFinite(l) || !Number.isFinite(r) || r <= l + 2) return null
  const startRatio = Math.max(0, Math.min(1, (l - coordsHostRect.left) / hostW))
  const endRatio = Math.max(startRatio, Math.min(1, (r - coordsHostRect.left) / hostW))
  const spanRatio = Math.max(0.02, endRatio - startRatio)
  return { startRatio, spanRatio }
}

function playbackLayoutsFromLineGroups(
  coordsHostRect: DOMRectReadOnly,
  hostW: number,
  lineGroups: StaffLineBand[][],
  ink: { top: number; bottom: number },
  systemNormBounds?: Array<{ top: number; bottom: number }>,
): PlaybackSystemLayout[] {
  const out: PlaybackSystemLayout[] = []
  lineGroups.forEach((group, groupIndex) => {
    if (!group.length) return
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    const elements: SVGGElement[] = []
    group.forEach((line) => {
      left = Math.min(left, line.left)
      right = Math.max(right, line.right)
      elements.push(...line.elements)
    })
    const measuredRange =
      measureStaffHorizontalRangeFromNodes(coordsHostRect, hostW, elements) ??
      toStaffHorizontalRangeFromBox(
        coordsHostRect,
        hostW,
        Number.isFinite(left) ? left : coordsHostRect.left,
        Number.isFinite(right) ? right : coordsHostRect.right,
      )
    if (!measuredRange) return
    const norm = systemNormBounds?.[groupIndex]
    const vertical =
      norm && Number.isFinite(norm.top) && Number.isFinite(norm.bottom) && norm.bottom > norm.top
        ? verticalLayoutFromOsmdNorm(norm, ink, coordsHostRect)
        : verticalLayoutFromDomLines(group, ink, coordsHostRect)
    out.push({
      ...measuredRange,
      ...vertical,
    })
  })
  return out
}

/**
 * 钢琴页：偶数条谱表行且 system 数在常见范围内（约 2~6 个双手谱块）。
 * 总谱整页连谱常有十几行，不能套用 lines/2。
 */
function inferPianoSystemCountFromLines(lines: StaffLineBand[]): number | undefined {
  const n = lines.length
  if (n < 4 || n % 2 !== 0) return undefined
  const systems = n / 2
  if (systems >= 2 && systems <= 6) return systems
  return undefined
}

function partitionStaffLinesEvenly(lines: StaffLineBand[], systemCount: number): StaffLineBand[][] {
  const n = Math.max(1, systemCount)
  if (n <= 1) {
    return lines.length > 0 ? [lines] : []
  }
  if (lines.length < n) {
    return []
  }
  if (lines.length === n) {
    return lines.map((line) => [line])
  }
  const perSys = lines.length / n
  if (Math.abs(perSys - Math.round(perSys)) > 0.01) {
    return []
  }
  const k = Math.round(perSys)
  const out: StaffLineBand[][] = []
  for (let i = 0; i < lines.length; i += k) {
    out.push(lines.slice(i, i + k))
  }
  return out.length === n ? out : []
}

function clusterStaffLinesByGap(
  lines: StaffLineBand[],
  coordsHostRect: DOMRectReadOnly,
): StaffLineBand[][] {
  if (!lines.length) return []

  const gaps: number[] = []
  for (let i = 1; i < lines.length; i += 1) {
    gaps.push(lines[i]!.top - lines[i - 1]!.bottom)
  }

  let gapThreshold: number
  if (gaps.length === 0) {
    gapThreshold = Number.POSITIVE_INFINITY
  } else if (gaps.length === 1) {
    gapThreshold = Math.max(gaps[0]! * 1.25, 48)
  } else {
    const sorted = [...gaps].sort((a, b) => a - b)
    let bestJump = 0
    let splitAfter = -1
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const jump = sorted[i + 1]! - sorted[i]!
      if (jump > bestJump) {
        bestJump = jump
        splitAfter = i
      }
    }
    if (bestJump > 10 && splitAfter >= 0) {
      gapThreshold = (sorted[splitAfter]! + sorted[splitAfter + 1]!) / 2
    } else {
      const hostH = coordsHostRect.height
      gapThreshold = Math.max(52, Math.min(140, hostH * 0.07))
    }
  }

  const clusterWithThreshold = (threshold: number): StaffLineBand[][] => {
    const groups: StaffLineBand[][] = []
    for (const line of lines) {
      if (!groups.length) {
        groups.push([line])
        continue
      }
      const cur = groups[groups.length - 1]!
      const maxBottom = Math.max(...cur.map((x) => x.bottom))
      if (line.top - maxBottom <= threshold) {
        cur.push(line)
      } else {
        groups.push([line])
      }
    }
    return groups
  }

  let clusters = clusterWithThreshold(gapThreshold)

  if (clusters.length === 1 && lines.length >= 4 && gaps.length >= 2) {
    const sortedGaps = [...gaps].sort((a, b) => a - b)
    const p25 = sortedGaps[Math.floor(sortedGaps.length * 0.25)]!
    const p75 = sortedGaps[Math.floor(sortedGaps.length * 0.75)]!
    if (p75 > p25 * 1.35) {
      const retryThreshold = (p25 + p75) / 2
      const retried = clusterWithThreshold(retryThreshold)
      if (retried.length > 1) {
        clusters = retried
      }
    }
  }

  return clusters
}

function resolveTargetSystemCount(
  lines: StaffLineBand[],
  targetSystemCount?: number,
): number | undefined {
  const pianoInferred = inferPianoSystemCountFromLines(lines)

  if (targetSystemCount === 1) {
    // OSMD 标明整页一个 MusicSystem（总谱连谱）：仅在像钢琴多 system 页时改按行数拆分
    if (pianoInferred && pianoInferred >= 2) {
      return pianoInferred
    }
    return 1
  }

  if (targetSystemCount != null && targetSystemCount > 1) {
    return targetSystemCount
  }

  return pianoInferred
}

/** DOM 上所有谱表行聚成一块：总谱整页连谱；钢琴双手谱块之间通常有明显空档会拆成多簇 */
function isFullPageConnectedScore(lines: StaffLineBand[], gapClusters: StaffLineBand[][]): boolean {
  return lines.length >= ORCHESTRA_FULL_PAGE_MIN_STAFF_LINES && gapClusters.length === 1
}

function groupStaffLinesIntoSystems(
  lines: StaffLineBand[],
  coordsHostRect: DOMRectReadOnly,
  targetSystemCount?: number,
): StaffLineBand[][] {
  if (!lines.length) return []

  const gapClusters = clusterStaffLinesByGap(lines, coordsHostRect)
  let target = resolveTargetSystemCount(lines, targetSystemCount)
  if (isFullPageConnectedScore(lines, gapClusters) && (targetSystemCount == null || targetSystemCount <= 1)) {
    target = 1
  }
  const pianoInferred = inferPianoSystemCountFromLines(lines)
  if (pianoInferred && pianoInferred > 1 && lines.length === pianoInferred * 2) {
    const pianoEven = partitionStaffLinesEvenly(lines, pianoInferred)
    if (pianoEven.length === pianoInferred) {
      return pianoEven
    }
  }
  if (target && target > 1) {
    const even = partitionStaffLinesEvenly(lines, target)
    if (even.length === target) {
      return even
    }
  }

  let clustered = gapClusters
  const allowRetry =
    !isFullPageConnectedScore(lines, gapClusters) ||
    (targetSystemCount != null && targetSystemCount > 1)
  if (clustered.length === 1 && lines.length >= 4 && allowRetry) {
    const retryTarget = target ?? inferPianoSystemCountFromLines(lines)
    if (retryTarget && retryTarget > 1) {
      const forced = partitionStaffLinesEvenly(lines, retryTarget)
      if (forced.length === retryTarget) {
        clustered = forced
      }
    }
  }
  return clustered
}

export function measurePlaybackStaffHorizontalRange(
  host: HTMLElement | null,
  svgOverride?: SVGSVGElement | null,
): PlaybackStaffHorizontalRange | null {
  const debugEnabled =
    String(import.meta.env.VITE_ORCHESTRA_DEBUG_CONSOLE ?? '').trim().toLowerCase() === 'true'
  if (!host || typeof host.getBoundingClientRect !== 'function') {
    if (debugEnabled) console.log('[playback-layout]:staff-range-fail', { reason: 'missing-host' })
    return null
  }

  // 分页模式传入的是 .score-pages 容器；滚动模式需传入当前页的 svg（避免 querySelector 命中第一页）。
  const svg =
    svgOverride ??
    host.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
    host.querySelector<SVGSVGElement>('svg')
  if (!svg) {
    if (debugEnabled) console.log('[playback-layout]:staff-range-fail', { reason: 'missing-svg' })
    return null
  }

  const hostRect = host.getBoundingClientRect()
  const hostW = hostRect.width
  if (!Number.isFinite(hostW) || hostW <= 1) {
    if (debugEnabled) console.log('[playback-layout]:staff-range-fail', { reason: 'invalid-host-width', hostW })
    return null
  }

  const bandNodes = queryLayoutBandElements(svg)
  if (debugEnabled) {
    console.log('[playback-layout]:staff-range-start', {
      staffNodesLen: bandNodes.length,
      hostRect,
    })
  }
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  bandNodes.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    let effectiveLeft = r.left
    const labelEls = el.querySelectorAll<SVGGElement>('g.label, g.labelAbbr')
    if (labelEls.length > 0) {
      let labelMaxRight = Number.NEGATIVE_INFINITY
      labelEls.forEach((lbl) => {
        const lr = lbl.getBoundingClientRect()
        if (lr.width > 1 && lr.height > 1) {
          labelMaxRight = Math.max(labelMaxRight, lr.right)
        }
      })
      if (Number.isFinite(labelMaxRight) && labelMaxRight < r.left + r.width * 0.5) {
        effectiveLeft = labelMaxRight + 2
      }
    }
    left = Math.min(left, effectiveLeft)
    right = Math.max(right, r.right)
  })

  const toRange = (l: number, r: number): PlaybackStaffHorizontalRange | null => {
    if (!Number.isFinite(l) || !Number.isFinite(r) || r <= l + 2) return null
    const startRatio = Math.max(0, Math.min(1, (l - hostRect.left) / hostW))
    const endRatio = Math.max(startRatio, Math.min(1, (r - hostRect.left) / hostW))
    const spanRatio = Math.max(0.02, endRatio - startRatio)
    return { startRatio, spanRatio }
  }

  const fromStaff = toRange(left, right)
  if (fromStaff) {
    if (debugEnabled) console.log('[playback-layout]:staff-range-success', { source: 'staff', fromStaff })
    return fromStaff
  }

  const score = svg.querySelector<SVGGElement>('g.score')
  if (score) {
    const r = score.getBoundingClientRect()
    const fromScore = toRange(r.left, r.right)
    if (debugEnabled) console.log('[playback-layout]:staff-range-success', { source: 'score', fromScore })
    return fromScore
  }

  if (debugEnabled) console.log('[playback-layout]:staff-range-fail', { reason: 'no-valid-range', left, right })
  return null
}

/**
 * OSMD 等引擎常无 `g.system`；按合并后的谱表行纵向间距聚类为「逻辑 system」，
 * 纵向范围一律取自 DOM 五线谱墨迹，排除页眉标题与页边留白。
 */
function playbackSystemLayoutsFromStaffVerticalClusters(
  coordsHostRect: DOMRectReadOnly,
  hostW: number,
  svg: SVGSVGElement,
  targetSystemCount?: number,
): PlaybackSystemLayout[] | null {
  const lines = collectStaffLineBands(svg)
  if (!lines.length) return null
  const ink = inkFrameFromStaffLines(lines)
  if (!ink) return null

  const lineGroups = groupStaffLinesIntoSystems(lines, coordsHostRect, targetSystemCount)
  if (!lineGroups.length) return null

  const out = playbackLayoutsFromLineGroups(coordsHostRect, hostW, lineGroups, ink)
  return out.length > 0 ? out : null
}

/** 供上层判断：单 system 布局是否应拆成多个钢琴双手谱 system */
export function shouldSplitSingleSystemPlaybackLayout(svg: SVGSVGElement | null): boolean {
  if (!svg) return false
  const lines = collectStaffLineBands(svg)
  const pianoSystems = inferPianoSystemCountFromLines(lines)
  return !!pianoSystems && pianoSystems > 1
}

function measureStaffHorizontalRangeFromNodes(
  coordsHostRect: DOMRectReadOnly,
  hostW: number,
  staffNodes: SVGGElement[],
): PlaybackStaffHorizontalRange | null {
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  staffNodes.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    let effectiveLeft = r.left
    const labelEls = el.querySelectorAll<SVGGElement>('g.label, g.labelAbbr')
    if (labelEls.length > 0) {
      let labelMaxRight = Number.NEGATIVE_INFINITY
      labelEls.forEach((lbl) => {
        const lr = lbl.getBoundingClientRect()
        if (lr.width > 1 && lr.height > 1) {
          labelMaxRight = Math.max(labelMaxRight, lr.right)
        }
      })
      if (Number.isFinite(labelMaxRight) && labelMaxRight < r.left + r.width * 0.5) {
        effectiveLeft = labelMaxRight + 2
      }
    }
    left = Math.min(left, effectiveLeft)
    right = Math.max(right, r.right)
  })
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left + 2) return null
  const startRatio = Math.max(0, Math.min(1, (left - coordsHostRect.left) / hostW))
  const endRatio = Math.max(startRatio, Math.min(1, (right - coordsHostRect.left) / hostW))
  const spanRatio = Math.max(0.02, endRatio - startRatio)
  return { startRatio, spanRatio }
}

/**
 * OSMD MusicSystem 仅用于确定页内 system 个数与分行；指示线 top/bottom 对齐 DOM 谱表行，
 * 避免把页标题、页边距算进 `hostH * normY`。
 */
function playbackSystemLayoutsFromOsmdNormBounds(
  coordsHostRect: DOMRectReadOnly,
  hostW: number,
  svg: SVGSVGElement,
  systemNormBounds: Array<{ top: number; bottom: number }>,
): PlaybackSystemLayout[] {
  const lines = collectStaffLineBands(svg)
  if (!lines.length) return []

  const ink = inkFrameFromStaffLines(lines)
  if (!ink) return []

  const lineGroups =
    systemNormBounds.length === 1
      ? [lines]
      : groupStaffLinesIntoSystems(lines, coordsHostRect, systemNormBounds.length)
  if (!lineGroups.length) return []

  return playbackLayoutsFromLineGroups(coordsHostRect, hostW, lineGroups, ink, systemNormBounds)
}

type InkSpanForSystemAttach = {
  left: number
  right: number
  top?: number
  bottom?: number
}

/** 为每个 system 附加页内墨迹横向区间（与 OSMD ink span 一致，避免 DOM 比例随视口漂移）。 */
export function attachInkHorizontalRangesToSystems(
  layouts: PlaybackSystemLayout[],
  inkSpans: InkSpanForSystemAttach[],
  systemNormBounds?: Array<{ top: number; bottom: number }>,
): PlaybackSystemLayout[] {
  if (!layouts.length || !inkSpans.length) return layouts
  return layouts.map((layout, idx) => {
    const bounds = systemNormBounds?.[idx]
    const eps = 1e-5
    const hits = inkSpans.filter((s) => {
      const spanHasY =
        typeof s.top === 'number' &&
        typeof s.bottom === 'number' &&
        Number.isFinite(s.top) &&
        Number.isFinite(s.bottom) &&
        s.bottom > s.top + 1e-6
      if (
        bounds &&
        spanHasY
      ) {
        const mid = ((s.top as number) + (s.bottom as number)) / 2
        return mid >= bounds.top - eps && mid <= bounds.bottom + eps
      }
      if (layout.nyTop != null && layout.nyBottom != null && spanHasY) {
        const mid = ((s.top as number) + (s.bottom as number)) / 2
        return mid >= layout.nyTop - eps && mid <= layout.nyBottom + eps
      }
      // 无纵向墨迹时不应把整页 span 绑到每个 system（会导致指示线卡在第一个连谱表上）。
      if (bounds || (layout.nyTop != null && layout.nyBottom != null)) {
        return false
      }
      return true
    })
    if (!hits.length) return layout
    const inkLeft = Math.min(...hits.map((s) => s.left))
    const inkRight = Math.max(...hits.map((s) => s.right))
    const inkSpan = Math.max(0.02, inkRight - inkLeft)
    return { ...layout, inkLeft, inkSpan }
  })
}

/** 测量当前 DOM 下页内墨迹区 client 包围盒（用于将 ink nx 映射到指示线宿主）。 */
export function measurePageMusicInkClientRect(
  coordsHost: HTMLElement | null,
  svg: SVGSVGElement | null,
): PageMusicInkClientRect | null {
  if (!coordsHost || !svg || typeof coordsHost.getBoundingClientRect !== 'function') return null
  const lines = collectStaffLineBands(svg)
  const ink = inkFrameFromStaffLines(lines)
  if (!ink) return null
  return {
    left: ink.left,
    top: ink.top,
    right: ink.right,
    bottom: ink.bottom,
    width: Math.max(1, ink.right - ink.left),
    height: Math.max(1, ink.bottom - ink.top),
  }
}

/** 将页内墨迹 nx∈[0,1] 转为指示线宿主上的 left 比例（0~100 需再乘 100）。 */
export function mapInkNormXToHostLeftRatio(
  nxInk: number,
  musicInkRect: PageMusicInkClientRect,
  coordsHostRect: DOMRectReadOnly,
): number {
  const nx = Math.max(0, Math.min(1, nxInk))
  const hostW = coordsHostRect.width
  if (!Number.isFinite(hostW) || hostW <= 1) return nx
  const xClient = musicInkRect.left + nx * musicInkRect.width
  return Math.max(0, Math.min(1, (xClient - coordsHostRect.left) / hostW))
}

/**
 * 将宿主容器上的归一化坐标 (0–1) 转为「谱面墨迹」归一化坐标，
 * 与 OSMD `pageMeasureInkNormSpans` / `pickTimedNoteForViewportPlacement` 同一参照。
 */
/** 仅将容器横坐标映射到墨迹 nx（纵坐标仍用容器 ny，供 DOM 选 system 行）。 */
export function mapContainerNormXToInkNormX(
  containerNormX: number,
  musicInkRect: PageMusicInkClientRect,
  containerRect: DOMRectReadOnly,
): number {
  const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
  const cx = clamp01(containerNormX)
  if (containerRect.width <= 1 || musicInkRect.width <= 1) return cx
  const xClient = containerRect.left + cx * containerRect.width
  return clamp01((xClient - musicInkRect.left) / musicInkRect.width)
}

export function mapContainerNormXYToInkNormXY(
  containerNormX: number,
  containerNormY: number,
  musicInkRect: PageMusicInkClientRect,
  containerRect: DOMRectReadOnly,
): { x: number; y: number } {
  const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
  const cx = clamp01(containerNormX)
  const cy = clamp01(containerNormY)
  if (containerRect.width <= 1 || containerRect.height <= 1) {
    return { x: cx, y: cy }
  }
  if (musicInkRect.width <= 1 || musicInkRect.height <= 1) {
    return { x: cx, y: cy }
  }
  const xClient = containerRect.left + cx * containerRect.width
  const yClient = containerRect.top + cy * containerRect.height
  return {
    x: clamp01((xClient - musicInkRect.left) / musicInkRect.width),
    y: clamp01((yClient - musicInkRect.top) / musicInkRect.height),
  }
}

/** `mapContainerNormXYToInkNormXY` 的逆映射：墨迹归一化 → 容器归一化（标注 overlay 定位）。 */
export function mapInkNormXYToContainerNormXY(
  inkNormX: number,
  inkNormY: number,
  musicInkRect: PageMusicInkClientRect,
  containerRect: DOMRectReadOnly,
): { x: number; y: number } {
  const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
  const ix = clamp01(inkNormX)
  const iy = clamp01(inkNormY)
  if (containerRect.width <= 1 || containerRect.height <= 1) {
    return { x: ix, y: iy }
  }
  if (musicInkRect.width <= 1 || musicInkRect.height <= 1) {
    return { x: ix, y: iy }
  }
  const xClient = musicInkRect.left + ix * musicInkRect.width
  const yClient = musicInkRect.top + iy * musicInkRect.height
  return {
    x: clamp01((xClient - containerRect.left) / containerRect.width),
    y: clamp01((yClient - containerRect.top) / containerRect.height),
  }
}

/**
 * 测量坐标宿主（coordsHost）中的 Verovio SVG system 布局（用于播放指示线）。
 *
 * - 系统内部的水平范围：对齐 system 内所有 `g.staff` 的合并包围盒。
 * - 纵向范围：使用 system 自身包围盒，指示线只覆盖当前 system。
 */
export function measurePlaybackSystemsLayout(
  coordsHost: HTMLElement | null,
  svg: SVGSVGElement | null,
  options: MeasurePlaybackSystemsLayoutOptions = {},
): PlaybackSystemLayout[] | null {
  const debugEnabled =
    String(import.meta.env.VITE_ORCHESTRA_DEBUG_CONSOLE ?? '').trim().toLowerCase() === 'true'
  if (!coordsHost || typeof coordsHost.getBoundingClientRect !== 'function') {
    if (debugEnabled) console.log('[playback-layout]:systems-fail', { reason: 'missing-coords-host' })
    return null
  }
  if (!svg) {
    if (debugEnabled) console.log('[playback-layout]:systems-fail', { reason: 'missing-svg' })
    return null
  }

  const coordsHostRect = coordsHost.getBoundingClientRect()
  const hostW = coordsHostRect.width
  const hostH = coordsHostRect.height
  if (!Number.isFinite(hostW) || hostW <= 1 || !Number.isFinite(hostH) || hostH <= 1) {
    if (debugEnabled) console.log('[playback-layout]:systems-fail', { reason: 'invalid-host-width', hostW, coordsHostRect })
    return null
  }

  const normBounds = options.systemNormBounds?.filter(
    (b) =>
      Number.isFinite(b.top) &&
      Number.isFinite(b.bottom) &&
      b.bottom > b.top + 1e-6,
  )
  if (normBounds && normBounds.length > 0) {
    const fromOsmd = playbackSystemLayoutsFromOsmdNormBounds(coordsHostRect, hostW, svg, normBounds)
    if (fromOsmd.length > 0) {
      if (debugEnabled) {
        console.log('[playback-layout]:systems-from-osmd-norm', { count: fromOsmd.length })
      }
      return fromOsmd
    }
  }

  const systemNodes = svg.querySelectorAll<SVGGElement>('g.system')
  if (debugEnabled) {
    console.log('[playback-layout]:systems-start', {
      systemNodesLen: systemNodes.length,
      coordsHostRect,
    })
  }

  if (!systemNodes.length) {
    const clustered = playbackSystemLayoutsFromStaffVerticalClusters(
      coordsHostRect,
      hostW,
      svg,
      normBounds?.length,
    )
    if (clustered && clustered.length > 0) {
      if (debugEnabled) {
        console.log('[playback-layout]:systems-from-staff-clusters', { count: clustered.length })
      }
      return clustered
    }
    if (debugEnabled) {
      console.log('[playback-layout]:systems-fail', {
        reason: 'no-staff-or-measure-bands',
        vfMeasureLen: svg.querySelectorAll(OSMD_MEASURE_SELECTOR).length,
        staffLen: svg.querySelectorAll(STAFF_LIKE_SELECTOR).length,
      })
    }
    return null
  }

  const systemList = Array.from(systemNodes)

  const toStaffHorizontalRange = (staffLeft: number, staffRight: number): PlaybackStaffHorizontalRange | null => {
    const l = staffLeft
    const r = staffRight
    if (!Number.isFinite(l) || !Number.isFinite(r) || r <= l + 2) return null
    const startRatio = Math.max(0, Math.min(1, (l - coordsHostRect.left) / hostW))
    const endRatio = Math.max(startRatio, Math.min(1, (r - coordsHostRect.left) / hostW))
    const spanRatio = Math.max(0.02, endRatio - startRatio)
    return { startRatio, spanRatio }
  }

  const pageStaffLines = collectStaffLineBands(svg)
  const pageInk = inkFrameFromStaffLines(pageStaffLines)

  const out: PlaybackSystemLayout[] = []
  systemList.forEach((systemEl, idx) => {
    const systemRect = systemEl.getBoundingClientRect()
    let topPx = Math.max(0, systemRect.top - coordsHostRect.top)
    let bottomPx = Math.max(0, coordsHostRect.bottom - systemRect.bottom)
    let nyTop: number | undefined
    let nyBottom: number | undefined

    const linesInSystem = pageStaffLines.filter(
      (line) => line.bottom >= systemRect.top - 8 && line.top <= systemRect.bottom + 8,
    )
    if (linesInSystem.length > 0) {
      let top = Number.POSITIVE_INFINITY
      let bottom = Number.NEGATIVE_INFINITY
      linesInSystem.forEach((line) => {
        top = Math.min(top, line.top)
        bottom = Math.max(bottom, line.bottom)
      })
      const vertical = verticalPxFromClientBox(top, bottom, coordsHostRect)
      topPx = vertical.topPx
      bottomPx = vertical.bottomPx
      if (pageInk) {
        nyTop = normYFromClientY(top, pageInk)
        nyBottom = normYFromClientY(bottom, pageInk)
      }
    }

    // 系统内水平对齐只看 system 内的谱表行（Verovio staff / VexFlow vf-stave）。
    // 排除 instrument label（乐器名），使其不占用指示线水平范围。
    const staffNodes = queryLayoutBandElements(systemEl)
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    staffNodes.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return
      let effectiveLeft = r.left
      const labelEls = el.querySelectorAll<SVGGElement>('g.label, g.labelAbbr')
      if (labelEls.length > 0) {
        let labelMaxRight = Number.NEGATIVE_INFINITY
        labelEls.forEach((lbl) => {
          const lr = lbl.getBoundingClientRect()
          if (lr.width > 1 && lr.height > 1) {
            labelMaxRight = Math.max(labelMaxRight, lr.right)
          }
        })
        if (Number.isFinite(labelMaxRight) && labelMaxRight < r.left + r.width * 0.5) {
          effectiveLeft = labelMaxRight + 2
        }
      }
      left = Math.min(left, effectiveLeft)
      right = Math.max(right, r.right)
    })

    // 某些极端情况下 system 内可能没有 staff（或 staff 尚未布局完成），则回退到 systemRect。
    const measuredRange = toStaffHorizontalRange(
      Number.isFinite(left) ? left : systemRect.left,
      Number.isFinite(right) ? right : systemRect.right,
    )

    if (!measuredRange) {
      if (debugEnabled) {
        console.log('[playback-layout]:systems-fail', {
          reason: 'no-valid-system-range',
          idx,
          systemRect,
          staffNodesLen: staffNodes.length,
          left,
          right,
        })
      }
      return
    }
    if (debugEnabled) {
      console.log('[playback-layout]:systems-item', {
        idx,
        systemRect,
        staffNodesLen: staffNodes.length,
        measuredRange,
        topPx,
        bottomPx,
      })
    }
    out.push({
      ...measuredRange,
      topPx,
      bottomPx,
      ...(nyTop != null && nyBottom != null ? { nyTop, nyBottom } : {}),
    })
  })

  if (out.length === 0) {
    if (debugEnabled) console.log('[playback-layout]:systems-fail', { reason: 'empty-out' })
    return null
  }
  if (debugEnabled) console.log('[playback-layout]:systems-success', { count: out.length })
  return out
}
