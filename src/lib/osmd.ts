import { OpenSheetMusicDisplay } from '@taotao-lib/opensheetmusicdisplay'
import type {
  OsmdInkNormMeasureSpan,
  OsmdMusicSystemNormBounds,
  RendererPageMeasureBounds,
} from '@/lib/musicXmlNoteAnchors'
import { annotationDebugLog } from '@/lib/annotationDebug'

export interface OsmdRenderOptions {
  /** 离屏渲染宿主宽度（px）；OSMD 用容器 offsetWidth 参与分页，默认 3000 */
  layoutHostWidthPx?: number
  /** 是否开启分页；true 时若无显式 pageFormat/pageWidth/pageHeight，使用 pagedFormat（默认 A4_P） */
  paged?: boolean
  /** 分页纸张格式，如 A4_P / A4_L / Letter_P */
  pagedFormat?: string
  /** 显式页格式，优先级高于 paged/pagedFormat */
  pageFormat?: string
  /** 显式宽高（毫米），优先级最高，内部会转成 `${pageWidth}x${pageHeight}` */
  pageWidth?: number
  pageHeight?: number
  /** 手动纸张宽高（MusicXML tenths），与 `pageWidth`/`pageHeight` 二选一；渲染前按文件 `<scaling>` 换算为 mm */
  pageWidthTenths?: number
  pageHeightTenths?: number
  /** 是否绘制标题 */
  drawTitle?: boolean
  /** 与 Verovio `inkColor` 一致：深色主题为浅色墨迹，浅色主题为黑色 */
  scoreTheme?: 'light' | 'dark'
  /**
   * 为 true（默认）时从 MusicXML `<defaults><page-layout>` 读取纸张宽高；
   * 为 false 时使用 `pageWidth` / `pageHeight`（未传时宽仍尝试从文件读取）。
   */
  useMusicXmlPageDimensions?: boolean
  /**
   * 大编制总谱（声部数 ≥ {@link LARGE_ORCHESTRA_MIN_PARTS}）时自动压低页高，尽量一页一个 system。
   * 由上层在「按文件默认打开」时开启；手动「应用排版」应传 false。
   */
  preferOneSystemPerPage?: boolean
}

/** 判定「大编制管弦乐总谱」的最小声部数（score-part 个数）。 */
export const LARGE_ORCHESTRA_MIN_PARTS = 12

/** 大编制总谱启用「一页一个 system」优化后的说明文案（侧栏 / 谱面横幅共用）。 */
export const OSMD_ORCHESTRAL_ONE_SYSTEM_LAYOUT_HINT =
  '已为大编制总谱自动调整页面高度，尽量每页只显示一个 system 连谱；未按乐谱文件原始 page-height 绘制，可在侧栏修改高度后重新应用排版。'

/** 一页一 system 自动排版结果（供 UI 提示与手动 tenths 同步）。 */
export interface OsmdOrchestralOneSystemLayoutInfo {
  applied: boolean
  partCount: number
  originalHeightTenths: number
  adjustedHeightTenths: number
  originalHeightMm: number
  adjustedHeightMm: number
}

function osmdConstructorOptionsForScoreTheme(theme: 'light' | 'dark' | undefined): {
  defaultColorMusic?: string
  defaultColorLabel?: string
  defaultColorTitle?: string
  defaultColorStem?: string
  defaultColorNotehead?: string
  defaultColorRest?: string
} {
  if (theme !== 'dark') return {}
  return {
    defaultColorMusic: '#ffffff',
    defaultColorLabel: '#ffffff',
    defaultColorTitle: '#ffffff',
    defaultColorStem: '#ffffff',
    defaultColorNotehead: '#ffffff',
    defaultColorRest: '#ffffff',
  }
}

/** OSMD 分页渲染结果：每页 HTML、小节闭区间、墨迹归一化水平几何（与 `ann.x` 参照一致） */
export interface OsmdPagedRenderResult {
  pages: string[]
  pageMeasureIndexBounds: RendererPageMeasureBounds[]
  /** 与 `pages.length` 一致；无引擎 API 或对齐失败时可为空数组页 */
  pageMeasureInkNormSpans: OsmdInkNormMeasureSpan[][]
  /** 与 `pages.length` 一致；每页各 MusicSystem 的墨迹归一化纵向范围（播放指示线高度） */
  pageMusicSystemNormBounds: OsmdMusicSystemNormBounds[][]
  /** 大编制总谱自动压低页高时非 null */
  orchestralOneSystemLayout?: OsmdOrchestralOneSystemLayoutInfo | null
}

function resolveOsmdPageFormat(options: OsmdRenderOptions): string {
  const {
    paged = true,
    pagedFormat = 'A4_P',
    pageFormat,
    pageWidth,
    pageHeight,
  } = options

  // 优先级：pageWidth+pageHeight > pageFormat > paged+pagedFormat > Endless
  if (typeof pageWidth === 'number' && typeof pageHeight === 'number') {
    return `${pageWidth}x${pageHeight}`
  }
  if (pageFormat) return pageFormat
  if (paged) return pagedFormat
  return 'Endless'
}

function extractOsmdPages(host: HTMLDivElement): string[] {
  // OSMD 分页模式通常将每一页渲染为独立 div（含一个 svg）；这里拆成数组供业务翻页使用。
  const pageContainers = Array.from(host.querySelectorAll(':scope > div')).filter((el) =>
    el.querySelector('svg'),
  )
  if (pageContainers.length > 0) {
    return pageContainers.map((el) => (el as HTMLElement).outerHTML)
  }

  // 兜底：若不是标准分页结构，退化为所有 svg 分页。
  const svgs = Array.from(host.querySelectorAll('svg')).map((svg) => svg.outerHTML)
  if (svgs.length > 0) {
    return svgs
  }

  // 再兜底：保持旧行为，至少返回 1 页，避免上层出现空数组。
  return [host.innerHTML]
}

/** fork 上 `OpenSheetMusicDisplay.getPageMeasureListIndexBounds` 的返回行（与 `@taotao-lib/opensheetmusicdisplay` 导出一致） */
export type OsmdPageMeasureListIndexBoundsRow = {
  pageNumber: number
  startMeasureListIndex: number
  endMeasureListIndex: number
}

type OsmdRawMeasureHorizontalLayout = {
  pageNumber: number
  measures: Array<{ measureListIndex: number; left: number; right: number; top?: number; bottom?: number }>
}

type OsmdGraphicLike = {
  MusicPages?: Array<{
    PageNumber: number
    MusicSystems?: Array<{
      GraphicalMeasures?: Array<Array<unknown> | null> | null
    } | null> | null
  } | null> | null
}

type GraphicalMeasureLike = {
  parentSourceMeasure?: { measureListIndex?: number }
  PositionAndShape: {
    AbsolutePosition: { x: number; y: number }
    BorderLeft: number
    BorderRight: number
    BorderTop: number
    BorderBottom: number
  }
}

type GraphicalMeasureWithInstrument = GraphicalMeasureLike & {
  ParentStaff?: { ParentInstrument?: { IdString?: string } }
}

/**
 * 按 `score-partwise` 下 `<part id="P1">` 的**文档顺序**建立 id → 0-based 下标，
 * 与导出时 `listScorePartElements`、MuseScore 分谱顺序一致。
 * OSMD 的 `sheet.Instruments[]` 下标与 MusicXML `<part>` 顺序可能不一致，不得用于 `partIndex0`。
 */
export function buildMusicXmlPartIdToPartIndex0Map(xml: string): Map<string, number> {
  const m = new Map<string, number>()
  const raw = xml?.trim()
  if (!raw) return m
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml')
    if (doc.querySelector('parsererror')) return m
    const root = doc.documentElement
    if (!root || root.localName !== 'score-partwise') return m
    let idx = 0
    for (const child of Array.from(root.children)) {
      if (child.localName !== 'part') continue
      const id = child.getAttribute('id')?.trim()
      if (id) m.set(id, idx)
      idx += 1
    }
  } catch {
    return m
  }
  return m
}

/**
 * 按 OSMD 图形中「每个 source 小节 × 每个乐器 part」的纵向外包分别建切片，
 * 使 ink span 的 ny 能区分总谱中不同 `<part>`（原先按 measureListIndex 合并会把整列压成一条带）。
 */
function collectPerPartMeasureVerticalSlices(
  osmd: OpenSheetMusicDisplay,
  partIdToIndex0: Map<string, number>,
): Map<number, Array<{ measureListIndex: number; partIndex0: number; top: number; bottom: number }>> {
  const graphic = (osmd as unknown as { graphic?: OsmdGraphicLike }).graphic
  const pages = graphic?.MusicPages
  const out = new Map<
    number,
    Array<{ measureListIndex: number; partIndex0: number; top: number; bottom: number }>
  >()
  if (!pages?.length) return out

  for (const page of pages) {
    if (!page) continue
    const pn = page.PageNumber
    const merge = new Map<string, { minT: number; maxB: number; mi: number; pi: number }>()
    for (const system of page.MusicSystems ?? []) {
      if (!system) continue
      for (const measureRow of system.GraphicalMeasures ?? []) {
        if (!measureRow) continue
        for (const gMeasure of measureRow) {
          if (!gMeasure) continue
          const gm = gMeasure as GraphicalMeasureWithInstrument
          const sm = gm.parentSourceMeasure
          if (!sm || typeof sm.measureListIndex !== 'number' || !Number.isFinite(sm.measureListIndex)) continue
          const idx = sm.measureListIndex
          const idStr = gm.ParentStaff?.ParentInstrument?.IdString?.trim()
          const partIdx = idStr && partIdToIndex0.has(idStr) ? (partIdToIndex0.get(idStr) as number) : 0
          const box = gm.PositionAndShape
          const edgeT = box.AbsolutePosition.y + box.BorderTop
          const edgeB = box.AbsolutePosition.y + box.BorderBottom
          const top = Math.min(edgeT, edgeB)
          const bottom = Math.max(edgeT, edgeB)
          const k = `${idx}:${partIdx}`
          const cur = merge.get(k)
          if (!cur) {
            merge.set(k, { minT: top, maxB: bottom, mi: idx, pi: partIdx })
          } else {
            cur.minT = Math.min(cur.minT, top)
            cur.maxB = Math.max(cur.maxB, bottom)
          }
        }
      }
    }
    const arr = [...merge.values()].map(({ minT, maxB, mi, pi }) => ({
      measureListIndex: mi,
      partIndex0: pi,
      top: minT,
      bottom: maxB,
    }))
    if (arr.length) out.set(pn, arr)
  }
  return out
}

/**
 * 从 OSMD 内部 graphic 汇总每页、每 source 小节的纵向外包（与水平 layout 同一绘图单位），
 * 用于区分一页多 system 时横向重叠的小节命中（不依赖 fork 发新版）。
 */
function collectMusicSystemNormBoundsByPage(
  osmd: OpenSheetMusicDisplay,
): Map<number, OsmdMusicSystemNormBounds[]> {
  const graphic = (osmd as unknown as { graphic?: OsmdGraphicLike }).graphic
  const pages = graphic?.MusicPages
  const out = new Map<number, OsmdMusicSystemNormBounds[]>()
  if (!pages?.length) return out

  const clamp01 = (u: number) => Math.max(0, Math.min(1, u))

  for (const page of pages) {
    if (!page) continue
    const pn = page.PageNumber
    const systems = page.MusicSystems ?? []

    let vMinTop = Number.POSITIVE_INFINITY
    let vMaxBottom = Number.NEGATIVE_INFINITY
    for (const system of systems) {
      if (!system) continue
      for (const measureRow of system.GraphicalMeasures ?? []) {
        if (!measureRow) continue
        for (const gMeasure of measureRow) {
          if (!gMeasure) continue
          const gm = gMeasure as GraphicalMeasureLike
          const box = gm.PositionAndShape
          const edgeT = box.AbsolutePosition.y + box.BorderTop
          const edgeB = box.AbsolutePosition.y + box.BorderBottom
          const top = Math.min(edgeT, edgeB)
          const bottom = Math.max(edgeT, edgeB)
          vMinTop = Math.min(vMinTop, top)
          vMaxBottom = Math.max(vMaxBottom, bottom)
        }
      }
    }
    if (!Number.isFinite(vMinTop) || !Number.isFinite(vMaxBottom) || vMaxBottom <= vMinTop) {
      out.set(pn, [])
      continue
    }
    const vRange = vMaxBottom - vMinTop || 1

    const pageSystems: OsmdMusicSystemNormBounds[] = []
    for (const system of systems) {
      if (!system) continue
      let minT = Number.POSITIVE_INFINITY
      let maxB = Number.NEGATIVE_INFINITY
      for (const measureRow of system.GraphicalMeasures ?? []) {
        if (!measureRow) continue
        for (const gMeasure of measureRow) {
          if (!gMeasure) continue
          const gm = gMeasure as GraphicalMeasureLike
          const box = gm.PositionAndShape
          const edgeT = box.AbsolutePosition.y + box.BorderTop
          const edgeB = box.AbsolutePosition.y + box.BorderBottom
          const top = Math.min(edgeT, edgeB)
          const bottom = Math.max(edgeT, edgeB)
          minT = Math.min(minT, top)
          maxB = Math.max(maxB, bottom)
        }
      }
      if (!Number.isFinite(minT) || !Number.isFinite(maxB) || maxB <= minT) continue
      const top = clamp01((minT - vMinTop) / vRange)
      let bottom = clamp01((maxB - vMinTop) / vRange)
      if (bottom <= top) {
        bottom = Math.min(1, top + 1e-4)
      }
      pageSystems.push({ top, bottom })
    }
    out.set(pn, pageSystems)
  }
  return out
}

function collectMeasureVerticalExtentsByPage(osmd: OpenSheetMusicDisplay): Map<number, Map<number, { top: number; bottom: number }>> {
  const graphic = (osmd as unknown as { graphic?: OsmdGraphicLike }).graphic
  const pages = graphic?.MusicPages
  const out = new Map<number, Map<number, { top: number; bottom: number }>>()
  if (!pages?.length) return out

  for (const page of pages) {
    if (!page) continue
    const pn = page.PageNumber
    const byIdx = new Map<number, { minT: number; maxB: number }>()
    for (const system of page.MusicSystems ?? []) {
      if (!system) continue
      for (const measureRow of system.GraphicalMeasures ?? []) {
        if (!measureRow) continue
        for (const gMeasure of measureRow) {
          if (!gMeasure) continue
          const gm = gMeasure as GraphicalMeasureLike
          const sm = gm.parentSourceMeasure
          if (!sm || typeof sm.measureListIndex !== 'number' || !Number.isFinite(sm.measureListIndex)) continue
          const idx = sm.measureListIndex
          const box = gm.PositionAndShape
          const edgeT = box.AbsolutePosition.y + box.BorderTop
          const edgeB = box.AbsolutePosition.y + box.BorderBottom
          const top = Math.min(edgeT, edgeB)
          const bottom = Math.max(edgeT, edgeB)
          const cur = byIdx.get(idx)
          if (!cur) {
            byIdx.set(idx, { minT: top, maxB: bottom })
          } else {
            cur.minT = Math.min(cur.minT, top)
            cur.maxB = Math.max(cur.maxB, bottom)
          }
        }
      }
    }
    const norm = new Map<number, { top: number; bottom: number }>()
    for (const [idx, e] of byIdx) {
      norm.set(idx, { top: e.minT, bottom: e.maxB })
    }
    out.set(pn, norm)
  }
  return out
}

type OpenSheetMusicDisplayWithPageBounds = OpenSheetMusicDisplay & {
  getPageMeasureListIndexBounds?: () => OsmdPageMeasureListIndexBoundsRow[]
  getPageMeasureHorizontalLayouts?: () => OsmdRawMeasureHorizontalLayout[]
}

/**
 * 调用 fork 正式 API `getPageMeasureListIndexBounds`；旧版无该方法时返回 []（上层回退均分映射）。
 * 发布含该 API 的 `@taotao-lib/opensheetmusicdisplay` 后，可与包内 `.d.ts` 对齐并去掉断言。
 */
function pageMeasureBoundsFromOsmd(osmd: OpenSheetMusicDisplay): RendererPageMeasureBounds[] {
  const ext = osmd as OpenSheetMusicDisplayWithPageBounds
  const fn = ext.getPageMeasureListIndexBounds
  if (typeof fn !== 'function') {
    return []
  }
  return fn.call(ext).map((b) => ({
    start: b.startMeasureListIndex,
    end: b.endMeasureListIndex,
  }))
}

type MusicSystemMeasureGroup = {
  systemIndex: number
  measureListIndexes: Set<number>
}

/** 按 OSMD MusicSystem 收集每页上的小节下标集合（与水平 layout 同一绘图单位）。 */
function collectMusicSystemMeasureGroupsOnPage(
  osmd: OpenSheetMusicDisplay,
  pageNumber: number,
): MusicSystemMeasureGroup[] {
  const graphic = (osmd as unknown as { graphic?: OsmdGraphicLike }).graphic
  const pages = graphic?.MusicPages
  if (!pages?.length) return []
  const page = pages.find((p) => p && p.PageNumber === pageNumber) ?? pages[pageNumber - 1]
  if (!page) return []
  const groups: MusicSystemMeasureGroup[] = []
  const systems = page.MusicSystems ?? []
  for (let si = 0; si < systems.length; si += 1) {
    const system = systems[si]
    if (!system) continue
    const measureListIndexes = new Set<number>()
    for (const measureRow of system.GraphicalMeasures ?? []) {
      if (!measureRow) continue
      for (const gMeasure of measureRow) {
        if (!gMeasure) continue
        const gm = gMeasure as GraphicalMeasureLike
        const sm = gm.parentSourceMeasure
        if (!sm || typeof sm.measureListIndex !== 'number' || !Number.isFinite(sm.measureListIndex)) {
          continue
        }
        measureListIndexes.add(sm.measureListIndex)
      }
    }
    if (measureListIndexes.size > 0) {
      groups.push({ systemIndex: si, measureListIndexes })
    }
  }
  return groups
}

function systemIndexForMeasureListIndex(
  groups: MusicSystemMeasureGroup[],
  measureListIndex: number,
): number {
  for (const g of groups) {
    if (g.measureListIndexes.has(measureListIndex)) return g.systemIndex
  }
  return 0
}

/**
 * 总谱一页多 system 时，各 system 的小节列在 OSMD 原始坐标上左缘对齐；
 * 若整页一起做 (left-min)/range，不同 system 的同列小节会叠成同一归一化区间。
 * 先在 system 内归一化，再映射到页内墨迹横向比例。
 */
function horizontalSpanInPageInkNorm(
  m: { left: number; right: number; measureListIndex: number },
  groups: MusicSystemMeasureGroup[],
  pageMinLeft: number,
  pageHRange: number,
  measuresOnPage: Array<{ measureListIndex: number; left: number; right: number }>,
): { left: number; right: number } {
  const si = systemIndexForMeasureListIndex(groups, m.measureListIndex)
  const group = groups.find((g) => g.systemIndex === si)
  if (!group || group.measureListIndexes.size === 0) {
    return {
      left: (m.left - pageMinLeft) / pageHRange,
      right: (m.right - pageMinLeft) / pageHRange,
    }
  }
  const sysMeasures = measuresOnPage.filter((x) => group.measureListIndexes.has(x.measureListIndex))
  if (!sysMeasures.length) {
    return {
      left: (m.left - pageMinLeft) / pageHRange,
      right: (m.right - pageMinLeft) / pageHRange,
    }
  }
  const sysMinLeft = Math.min(...sysMeasures.map((x) => x.left))
  const sysMaxRight = Math.max(...sysMeasures.map((x) => x.right))
  const sysHRange = sysMaxRight - sysMinLeft || 1
  const sysPageLeft = (sysMinLeft - pageMinLeft) / pageHRange
  const sysPageSpan = sysHRange / pageHRange
  const leftInSys = (m.left - sysMinLeft) / sysHRange
  const rightInSys = (m.right - sysMinLeft) / sysHRange
  return {
    left: sysPageLeft + leftInSys * sysPageSpan,
    right: sysPageLeft + rightInSys * sysPageSpan,
  }
}

function pageMeasureInkNormSpansFromOsmd(
  osmd: OpenSheetMusicDisplay,
  pageContainers: HTMLElement[],
  partIdToIndex0: Map<string, number>,
): OsmdInkNormMeasureSpan[][] {
  const ext = osmd as OpenSheetMusicDisplayWithPageBounds
  const layoutFn = ext.getPageMeasureHorizontalLayouts
  if (typeof layoutFn !== 'function' || !pageContainers.length) {
    return pageContainers.map(() => [])
  }
  let raw: OsmdRawMeasureHorizontalLayout[]
  try {
    raw = layoutFn.call(ext)
  } catch {
    return pageContainers.map(() => [])
  }
  if (!Array.isArray(raw) || raw.length !== pageContainers.length) {
    return pageContainers.map(() => [])
  }
  const verticalByPage = collectMeasureVerticalExtentsByPage(osmd)
  const perPartSlicesByPage =
    partIdToIndex0.size > 0 ? collectPerPartMeasureVerticalSlices(osmd, partIdToIndex0) : new Map()
  const out: OsmdInkNormMeasureSpan[][] = []
  for (let i = 0; i < pageContainers.length; i++) {
    const layout = raw[i]
    const measures = layout?.measures
    if (!measures?.length) {
      out.push([])
      continue
    }
    // 使用 measure 自身的 extent 做归一化（viewport-independent），不再依赖 SVG getBBox()
    // 因为 getBBox() 返回的坐标单位与 OSMD 内部 measure 坐标不在同一坐标系，
    // 导致归一化后的 span 范围随容器宽高变化，在不同视口/全屏下不兼容。
    const pageMinLeft = Math.min(...measures.map((m) => m.left))
    const pageMaxRight = Math.max(...measures.map((m) => m.right))
    const pageHRange = pageMaxRight - pageMinLeft || 1
    const systemGroups = collectMusicSystemMeasureGroupsOnPage(osmd, layout.pageNumber)
    const vertForPage = verticalByPage.get(layout.pageNumber) ?? new Map<number, { top: number; bottom: number }>()
    const partPageSlices = perPartSlicesByPage.get(layout.pageNumber) ?? []
    const byMi = new Map<number, typeof partPageSlices>()
    for (const sl of partPageSlices) {
      const arr = byMi.get(sl.measureListIndex) ?? []
      arr.push(sl)
      byMi.set(sl.measureListIndex, arr)
    }

    let vMinTop = Infinity
    let vMaxBottom = -Infinity
    for (const m of measures) {
      const ve = vertForPage.get(m.measureListIndex)
      if (ve) {
        vMinTop = Math.min(vMinTop, ve.top)
        vMaxBottom = Math.max(vMaxBottom, ve.bottom)
      }
    }
    for (const sl of partPageSlices) {
      vMinTop = Math.min(vMinTop, sl.top)
      vMaxBottom = Math.max(vMaxBottom, sl.bottom)
    }
    if (vMinTop === Infinity) vMinTop = 0
    if (vMaxBottom === -Infinity) vMaxBottom = 1
    const vRange = vMaxBottom - vMinTop || 1
    const clamp01 = (u: number) => Math.max(0, Math.min(1, u))

    const spanForMergedVertical = (m: (typeof measures)[0]): OsmdInkNormMeasureSpan => {
      const { left, right } = horizontalSpanInPageInkNorm(
        m,
        systemGroups,
        pageMinLeft,
        pageHRange,
        measures,
      )
      const v = vertForPage.get(m.measureListIndex)
      if (!v) {
        return { measureListIndex: m.measureListIndex, left, right }
      }
      const top = clamp01((v.top - vMinTop) / vRange)
      let bottom = clamp01((v.bottom - vMinTop) / vRange)
      if (bottom <= top) {
        bottom = Math.min(1, top + 1e-4)
      }
      return {
        measureListIndex: m.measureListIndex,
        left,
        right,
        top,
        bottom,
      }
    }

    const spansFlat: OsmdInkNormMeasureSpan[] = []
    for (const m of measures) {
      const { left, right } = horizontalSpanInPageInkNorm(
        m,
        systemGroups,
        pageMinLeft,
        pageHRange,
        measures,
      )
      const slices = byMi.get(m.measureListIndex)
      if (!slices?.length) {
        spansFlat.push(spanForMergedVertical(m))
        continue
      }
      for (const sl of slices) {
        const top = clamp01((sl.top - vMinTop) / vRange)
        let bottom = clamp01((sl.bottom - vMinTop) / vRange)
        if (bottom <= top) {
          bottom = Math.min(1, top + 1e-4)
        }
        spansFlat.push({
          measureListIndex: m.measureListIndex,
          left,
          right,
          top,
          bottom,
          partIndex0: sl.partIndex0,
        })
      }
    }
    out.push(spansFlat)
  }
  return out
}

/**
 * 使用 OpenSheetMusicDisplay 将 MusicXML 渲染为 SVG 容器 HTML。
 * 结果按页拆分；并返回与 OSMD 实际分页一致的首声部小节下标闭区间（供标注锚点映射）。
 */

/**
 * 将 `<defaults><page-layout>` 的 page-width / page-height 改为指定 tenths。
 * 手动纸张模式时供 OSMD `load()` 使用，避免 load 仍按文件内尺寸排版。
 */
export function patchMusicXmlPageLayoutTenths(
  xml: string,
  widthTenths: number,
  heightTenths: number,
): string {
  if (!Number.isFinite(widthTenths) || !Number.isFinite(heightTenths) || widthTenths <= 0 || heightTenths <= 0) {
    return xml
  }
  try {
    const stripped = xml.replace(/<!DOCTYPE[^>]*>/gi, '')
    const parser = new DOMParser()
    const doc = parser.parseFromString(stripped, 'application/xml')
    if (doc.querySelector('parsererror')) return xml
    const root = doc.documentElement
    if (!root) return xml

    let defs = doc.querySelector('defaults')
    if (!defs) {
      defs = doc.createElement('defaults')
      root.insertBefore(defs, root.firstChild)
    }
    let pageEl = defs.querySelector('page-layout')
    if (!pageEl) {
      pageEl = doc.createElement('page-layout')
      defs.appendChild(pageEl)
    }
    const setChildText = (localName: string, text: string) => {
      let el = pageEl!.querySelector(localName)
      if (!el) {
        el = doc.createElement(localName)
        pageEl!.appendChild(el)
      }
      el.textContent = text
    }
    setChildText('page-width', String(widthTenths))
    setChildText('page-height', String(heightTenths))
    return new XMLSerializer().serializeToString(doc)
  } catch {
    return xml
  }
}

/** OSMD 离屏 DOM 宽度（px）：由纸张宽度 mm 推算，仅影响横向缩放/分页密度，不是 MusicXML 的 page-width。 */
export const DEFAULT_OSMD_LAYOUT_HOST_WIDTH_PX = 3000

export function resolveOsmdLayoutHostWidthPx(pageWidthMm?: number): number {
  if (typeof pageWidthMm === 'number' && Number.isFinite(pageWidthMm) && pageWidthMm > 0) {
    const pxPerMm = DEFAULT_OSMD_LAYOUT_HOST_WIDTH_PX / 210
    return Math.max(1200, Math.min(10000, Math.round(pageWidthMm * pxPerMm)))
  }
  return DEFAULT_OSMD_LAYOUT_HOST_WIDTH_PX
}

/** 手动模式：改写 XML 内 page-layout；文件模式：原样。 */
function musicXmlForOsmdLoad(musicXml: string, options: OsmdRenderOptions): string {
  if (options.useMusicXmlPageDimensions !== false) return musicXml
  const w = options.pageWidthTenths
  const h = options.pageHeightTenths
  if (typeof w === 'number' && typeof h === 'number' && Number.isFinite(w) && Number.isFinite(h)) {
    return patchMusicXmlPageLayoutTenths(musicXml, w, h)
  }
  return musicXml
}

function applyResolvedPageFormatToOsmd(
  osmd: OpenSheetMusicDisplay,
  resolvedOptions: OsmdRenderOptions,
): void {
  const pageWidth = resolvedOptions.pageWidth
  const pageHeight = resolvedOptions.pageHeight
  if (typeof pageWidth === 'number' && typeof pageHeight === 'number' && pageWidth > 0 && pageHeight > 0) {
    osmd.setCustomPageFormat(pageWidth, pageHeight)
  }
}

/** 合并 OSMD 分页用的纸张宽高：文件模式自动提取，手动模式补全未传的宽/高。 */
export function mergeOsmdPageFormatOptions(
  musicXml: string,
  options: OsmdRenderOptions,
): OsmdRenderOptions {
  const useFile = options.useMusicXmlPageDimensions !== false
  if (useFile) {
    if (
      typeof options.pageWidth === 'number' ||
      typeof options.pageHeight === 'number' ||
      typeof options.pageFormat === 'string'
    ) {
      return options
    }
    const dim = extractMusicXmlPageLayout(musicXml)
    if (!dim) return options
    return { ...options, pageWidth: dim.widthMm, pageHeight: dim.heightMm }
  }
  const dim = extractMusicXmlPageLayout(musicXml)
  const widthTenths =
    typeof options.pageWidthTenths === 'number' && Number.isFinite(options.pageWidthTenths)
      ? options.pageWidthTenths
      : dim?.widthTenths
  const heightTenths =
    typeof options.pageHeightTenths === 'number' && Number.isFinite(options.pageHeightTenths)
      ? options.pageHeightTenths
      : dim?.heightTenths
  if (widthTenths != null && heightTenths != null && widthTenths > 0 && heightTenths > 0) {
    const mm = pageLayoutTenthsToMm(widthTenths, heightTenths, musicXml)
    return { ...options, pageWidth: mm.widthMm, pageHeight: mm.heightMm }
  }
  const pageWidth =
    typeof options.pageWidth === 'number' && Number.isFinite(options.pageWidth)
      ? options.pageWidth
      : (dim?.widthMm ?? 210)
  const pageHeight =
    typeof options.pageHeight === 'number' && Number.isFinite(options.pageHeight)
      ? options.pageHeight
      : (dim?.heightMm ?? 297)
  return { ...options, pageWidth, pageHeight }
}

/** MusicXML `<defaults><scaling>`：tenths 与毫米的换算关系。 */
export interface MusicXmlScaling {
  millimeters: number
  tenths: number
}

/** 无 `<scaling>` 时 OSMD 换算回退（与常见 MuseScore 导出接近：7 mm = 40 tenths）。 */
export const DEFAULT_MUSICXML_SCALING: MusicXmlScaling = {
  millimeters: 7,
  tenths: 40,
}

/** MusicXML `<page-layout>` 原始 tenths 与换算后的毫米（供界面展示与 OSMD 分页）。 */
export interface MusicXmlPageLayoutFromFile {
  /** `<page-width>`，MusicXML 单位 tenths */
  widthTenths: number
  /** `<page-height>`，MusicXML 单位 tenths */
  heightTenths: number
  widthMm: number
  heightMm: number
  scaling: MusicXmlScaling
}

/** 从 MusicXML 读取 `<scaling>`；失败时返回 null。 */
export function extractMusicXmlScaling(xml: string): MusicXmlScaling | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    const scalingEl = doc.querySelector('defaults scaling')
    if (!scalingEl) return null
    const millimeters = Number(scalingEl.querySelector('millimeters')?.textContent)
    const tenths = Number(scalingEl.querySelector('tenths')?.textContent)
    if (!(Number.isFinite(millimeters) && Number.isFinite(tenths) && millimeters > 0 && tenths > 0)) {
      return null
    }
    return { millimeters, tenths }
  } catch {
    return null
  }
}

/** tenths → mm，按 MusicXML scaling（与 `<page-width>` / `<page-height>` 同体系）。 */
export function musicXmlTenthsToMm(tenths: number, scaling: MusicXmlScaling = DEFAULT_MUSICXML_SCALING): number {
  if (!Number.isFinite(tenths) || tenths <= 0) return 0
  const unit = scaling.millimeters / scaling.tenths
  return Math.round(tenths * unit)
}

/** 将 page-layout 的 tenths 宽高换算为 OSMD 用的毫米。 */
export function pageLayoutTenthsToMm(
  widthTenths: number,
  heightTenths: number,
  musicXml: string,
): { widthMm: number; heightMm: number; scaling: MusicXmlScaling } {
  const scaling = extractMusicXmlScaling(musicXml) ?? DEFAULT_MUSICXML_SCALING
  return {
    widthMm: musicXmlTenthsToMm(widthTenths, scaling),
    heightMm: musicXmlTenthsToMm(heightTenths, scaling),
    scaling,
  }
}

/**
 * 从 MusicXML `<defaults><page-layout>` 读取页面尺寸（含 XML 原始 tenths）。
 * 若无法解析则返回 null，上层回退到 A4_P 等默认格式。
 */
export function extractMusicXmlPageLayout(xml: string): MusicXmlPageLayoutFromFile | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    const defs = doc.querySelector('defaults')
    if (!defs) return null
    const scalingEl = defs.querySelector('scaling')
    const pageEl = defs.querySelector('page-layout')
    if (!scalingEl || !pageEl) return null
    const scaling = extractMusicXmlScaling(xml)
    if (!scaling) return null
    const pw = Number(pageEl.querySelector('page-width')?.textContent)
    const ph = Number(pageEl.querySelector('page-height')?.textContent)
    if (!(Number.isFinite(pw) && Number.isFinite(ph) && pw > 0 && ph > 0)) return null
    return {
      widthTenths: pw,
      heightTenths: ph,
      widthMm: musicXmlTenthsToMm(pw, scaling),
      heightMm: musicXmlTenthsToMm(ph, scaling),
      scaling,
    }
  } catch {
    return null
  }
}

/** @deprecated 请优先使用 `extractMusicXmlPageLayout`；保留兼容导出。 */
export function extractMusicXmlPageDimensionsInMm(xml: string): { widthMm: number; heightMm: number } | null {
  const layout = extractMusicXmlPageLayout(xml)
  if (!layout) return null
  return { widthMm: layout.widthMm, heightMm: layout.heightMm }
}

/** mm → tenths（与 {@link musicXmlTenthsToMm} 互逆）。 */
export function musicXmlMmToTenths(mm: number, scaling: MusicXmlScaling = DEFAULT_MUSICXML_SCALING): number {
  if (!Number.isFinite(mm) || mm <= 0) return 0
  return Math.round((mm * scaling.tenths) / scaling.millimeters)
}

/** 统计 MusicXML `part-list` 内 `score-part` 数量。 */
export function countMusicXmlScoreParts(xml: string): number {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) return 0
    return doc.querySelectorAll('part-list score-part').length
  } catch {
    return 0
  }
}

/** OSMD 在 render 时按离屏容器宽度推算的有效页高（mm）。 */
export function resolveOsmdEffectivePageHeightMm(pageHeightMm: number): number {
  if (!Number.isFinite(pageHeightMm) || pageHeightMm <= 0) return 0
  const hostWidthFactor = DEFAULT_OSMD_LAYOUT_HOST_WIDTH_PX / 210 / 10
  return pageHeightMm * hostWidthFactor
}

function extractPageVerticalMarginsTenths(xml: string): number | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    const margins = doc.querySelector('defaults page-layout page-margins')
    if (!margins) return null
    const top = Number(margins.querySelector('top-margin')?.textContent)
    const bottom = Number(margins.querySelector('bottom-margin')?.textContent)
    if (!(Number.isFinite(top) && Number.isFinite(bottom))) return null
    return top + bottom
  } catch {
    return null
  }
}

/**
 * 估算「一页只容纳一个管弦乐 system」所需的 page-height（tenths）。
 * 结合声部数、页边距与当前 layoutHost 宽度换算下的 OSMD 有效页高。
 */
export function estimateOrchestralOneSystemPageHeightTenths(musicXml: string): number | null {
  const partCount = countMusicXmlScoreParts(musicXml)
  if (partCount < LARGE_ORCHESTRA_MIN_PARTS) return null
  const layout = extractMusicXmlPageLayout(musicXml)
  if (!layout) return null

  const marginsTenths = extractPageVerticalMarginsTenths(musicXml) ?? 480
  const effectiveFactor = DEFAULT_OSMD_LAYOUT_HOST_WIDTH_PX / 210 / 10
  const singleSystemBodyMm = 12 + partCount * 13.2
  const marginMm = musicXmlTenthsToMm(marginsTenths, layout.scaling)
  const titleReserveMm = 16
  const targetEffectiveMm = singleSystemBodyMm * 1.07 + marginMm + titleReserveMm

  let heightMm = targetEffectiveMm / effectiveFactor
  const minHeightMm = singleSystemBodyMm * 0.9 + marginMm * 0.4
  const maxHeightMm = layout.heightMm * 0.76
  heightMm = Math.max(minHeightMm, Math.min(maxHeightMm, heightMm))

  return musicXmlMmToTenths(heightMm, layout.scaling)
}

/** 大编制总谱：压低页高并改写为手动 tenths 模式（保留文件页宽）。 */
export function planOrchestralOneSystemPageLayout(
  musicXml: string,
  options: OsmdRenderOptions,
): { options: OsmdRenderOptions; meta: OsmdOrchestralOneSystemLayoutInfo } | null {
  if (options.preferOneSystemPerPage === false) return null
  const partCount = countMusicXmlScoreParts(musicXml)
  if (partCount < LARGE_ORCHESTRA_MIN_PARTS) return null
  const layout = extractMusicXmlPageLayout(musicXml)
  if (!layout) return null
  const adjustedHeightTenths = estimateOrchestralOneSystemPageHeightTenths(musicXml)
  if (!adjustedHeightTenths || adjustedHeightTenths >= layout.heightTenths * 0.97) {
    return null
  }

  const mm = pageLayoutTenthsToMm(layout.widthTenths, adjustedHeightTenths, musicXml)
  return {
    options: {
      ...options,
      useMusicXmlPageDimensions: false,
      pageWidthTenths: layout.widthTenths,
      pageHeightTenths: adjustedHeightTenths,
      pageWidth: mm.widthMm,
      pageHeight: mm.heightMm,
    },
    meta: {
      applied: true,
      partCount,
      originalHeightTenths: layout.heightTenths,
      adjustedHeightTenths,
      originalHeightMm: layout.heightMm,
      adjustedHeightMm: mm.heightMm,
    },
  }
}

function maxMusicSystemsPerPage(bounds: OsmdMusicSystemNormBounds[][]): number {
  if (!bounds.length) return 0
  return bounds.reduce((max, page) => Math.max(max, page?.length ?? 0), 0)
}

type OsmdRenderCoreResult = Omit<OsmdPagedRenderResult, 'orchestralOneSystemLayout'>

async function renderOsmdOnce(musicXml: string, options: OsmdRenderOptions): Promise<OsmdRenderCoreResult> {
  const mergedForHost = mergeOsmdPageFormatOptions(musicXml, options)
  const layoutHostWidthPx =
    typeof options.layoutHostWidthPx === 'number' &&
    Number.isFinite(options.layoutHostWidthPx) &&
    options.layoutHostWidthPx > 0
      ? Math.round(options.layoutHostWidthPx)
      : resolveOsmdLayoutHostWidthPx(mergedForHost.pageWidth)
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-99999px'
  host.style.top = '0'
  host.style.width = `${layoutHostWidthPx}px`
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)

  try {
    const { drawTitle = true } = options
    const resolvedOptions = mergedForHost
    const resolvedPageFormat = resolveOsmdPageFormat(resolvedOptions)
    const xmlForLoad = musicXmlForOsmdLoad(musicXml, options)
    const scoreTheme: 'light' | 'dark' = options.scoreTheme === 'dark' ? 'dark' : 'light'

    annotationDebugLog('OSMD解析时候的页面参数', {
      pageFormat: resolvedPageFormat,
      useMusicXmlPageDimensions: options.useMusicXmlPageDimensions !== false,
      pageWidthMm: resolvedOptions.pageWidth,
      pageHeightMm: resolvedOptions.pageHeight,
      pageWidthTenths: options.pageWidthTenths,
      pageHeightTenths: options.pageHeightTenths,
      preferOneSystemPerPage: options.preferOneSystemPerPage,
      xmlPatchedForLoad: xmlForLoad !== musicXml,
    })

    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: 'svg',
      drawTitle,
      pageFormat: resolvedPageFormat,
      ...osmdConstructorOptionsForScoreTheme(scoreTheme),
    })
    await osmd.load(xmlForLoad)
    applyResolvedPageFormatToOsmd(osmd, resolvedOptions)
    osmd.render()
    const pageContainers = Array.from(host.querySelectorAll(':scope > div')).filter((el) =>
      el.querySelector('svg'),
    ) as HTMLElement[]
    const pages =
      pageContainers.length > 0
        ? pageContainers.map((el) => (el as HTMLElement).outerHTML)
        : extractOsmdPages(host)
    const rawBounds = pageMeasureBoundsFromOsmd(osmd)
    const pageMeasureIndexBounds = rawBounds.length === pages.length ? rawBounds : []
    const partIdToIndex0 = buildMusicXmlPartIdToPartIndex0Map(musicXml)
    const pageMeasureInkNormSpans =
      pageContainers.length === pages.length
        ? pageMeasureInkNormSpansFromOsmd(osmd, pageContainers, partIdToIndex0)
        : pages.map(() => [])
    const systemsByPageNumber = collectMusicSystemNormBoundsByPage(osmd)
    const pageMusicSystemNormBounds = pages.map((_, i) => {
      const layout = (osmd as OpenSheetMusicDisplayWithPageBounds).getPageMeasureHorizontalLayouts?.()
      const pageNumber =
        Array.isArray(layout) && layout[i] && typeof layout[i]!.pageNumber === 'number'
          ? layout[i]!.pageNumber
          : i + 1
      return systemsByPageNumber.get(pageNumber) ?? systemsByPageNumber.get(i + 1) ?? []
    })
    return { pages, pageMeasureIndexBounds, pageMeasureInkNormSpans, pageMusicSystemNormBounds }
  } finally {
    host.remove()
  }
}

export async function renderMusicXmlWithOsmdPages(
  musicXml: string,
  options: OsmdRenderOptions = {},
): Promise<OsmdPagedRenderResult> {
  // 先交出主线程，使上层设的 loading 遮罩有机会完成首次绘制（后续仍有大量同步解析）。
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => requestAnimationFrame(() => r()))

  let workingOptions: OsmdRenderOptions = { ...options }
  let orchestralMeta: OsmdOrchestralOneSystemLayoutInfo | null = null

  const plan = planOrchestralOneSystemPageLayout(musicXml, workingOptions)
  if (plan) {
    workingOptions = {
      ...plan.options,
      layoutHostWidthPx:
        options.layoutHostWidthPx ??
        resolveOsmdLayoutHostWidthPx(plan.options.pageWidth),
    }
    orchestralMeta = plan.meta
  }

  const mergedForHost = mergeOsmdPageFormatOptions(musicXml, workingOptions)
  if (!workingOptions.layoutHostWidthPx) {
    workingOptions = {
      ...workingOptions,
      layoutHostWidthPx: resolveOsmdLayoutHostWidthPx(mergedForHost.pageWidth),
    }
  }

  const MAX_REFINE = 5
  let result: OsmdRenderCoreResult | null = null

  for (let attempt = 0; attempt < MAX_REFINE; attempt += 1) {
    result = await renderOsmdOnce(musicXml, workingOptions)
    if (!orchestralMeta) break

    const maxSystems = maxMusicSystemsPerPage(result.pageMusicSystemNormBounds)
    if (maxSystems <= 1) break

    const merged = mergeOsmdPageFormatOptions(musicXml, workingOptions)
    const pageWidth = merged.pageWidth
    const pageHeight = merged.pageHeight
    if (!(typeof pageWidth === 'number' && typeof pageHeight === 'number')) break

    const nextHeightMm = Math.max(140, pageHeight * 0.88)
    if (nextHeightMm >= pageHeight - 0.5) break

    const layout = extractMusicXmlPageLayout(musicXml)
    workingOptions = {
      ...workingOptions,
      useMusicXmlPageDimensions: false,
      pageWidth,
      pageHeight: nextHeightMm,
      pageWidthTenths: layout?.widthTenths,
      pageHeightTenths: layout
        ? musicXmlMmToTenths(nextHeightMm, layout.scaling)
        : undefined,
    }
    if (layout && orchestralMeta) {
      orchestralMeta.adjustedHeightMm = Math.round(nextHeightMm)
      orchestralMeta.adjustedHeightTenths = musicXmlMmToTenths(nextHeightMm, layout.scaling)
    }
  }

  return {
    ...result!,
    orchestralOneSystemLayout: orchestralMeta,
  }
}

/**
 * 兼容旧调用：将分页结果拼成一个连续 HTML 字符串。
 */
export async function renderMusicXmlWithOsmd(
  musicXml: string,
  options: OsmdRenderOptions = {},
): Promise<string> {
  const { pages } = await renderMusicXmlWithOsmdPages(musicXml, options)
  return pages.join('')
}
