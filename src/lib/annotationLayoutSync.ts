import type { ScoreAnnotationRecord } from '@/lib/scoreCache'

export type OsmdMeasureLayoutFields = Pick<
  ScoreAnnotationRecord,
  'anchorMeasureFracX' | 'anchorMeasureInkDeltaY' | 'anchorMeasureVertFracY' | 'anchorMeasureDomInkYNorm'
>
import type {
  OsmdInkNormMeasureSpan,
  RendererPageMeasureBounds,
} from '@/lib/musicXmlNoteAnchors'

/** 标注相对小节墨迹 span 的几何，用于排版变化后重投影。 */
export type MeasureInkFraction = {
  fracX: number
  /**
   * 墨迹 ny 相对该 span `top` 的归一化偏移（依赖页面 vRange，排版变化后会漂移）。
   * 新标注优先使用 vertFracY；此字段保留作为旧标注的降级路径。
   */
  inkDeltaYFromSpanTop: number
  /**
   * 纵向位置占锚定小节 span 高度的比例：(inkY - spanTop) / (spanBottom - spanTop)。
   * 排版无关量，不受页面 vRange 变化影响。重排版后优先使用此值恢复纵向位置。
   */
  vertFracY?: number
  /**
   * 相对页内 DOM 墨迹区（`measurePageMusicInkClientRect`）顶边的纵轴比例，与 overlay 视觉一致。
   * 重排后优先用此值恢复纵向，避免 OSMD span 与 DOM 墨迹坐标系不一致导致偏下。
   */
  domInkYNorm?: number
}

/** 无历史墨迹坐标时，落在小节内的默认横向比例（偏左，接近导播 cue）。 */
export const DEFAULT_MEASURE_INK_FRAC_X = 0.38
/** 无快照时：默认落在谱表顶边略上方（与导播类标注一致）。 */
export const DEFAULT_INK_DELTA_Y_ABOVE_STAFF = -0.04

const clamp01 = (u: number) => Math.max(0, Math.min(1, u))

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

function verticalDistanceToSpanInk(s: OsmdInkNormMeasureSpan, ny: number): number {
  if (!spanHasVerticalInk(s)) return 0.5
  const t = s.top as number
  const b = s.bottom as number
  if (ny < t) return t - ny
  if (ny > b) return ny - b
  return 0
}

/** 按首声部小节下标解析 1-based 渲染页码。 */
export function resolveRendererPageForMeasure(
  measureIndex0: number,
  bounds: RendererPageMeasureBounds[],
): number | null {
  if (!Number.isFinite(measureIndex0) || measureIndex0 < 0 || !bounds.length) return null
  const pageIdx = bounds.findIndex((b) => measureIndex0 >= b.start && measureIndex0 <= b.end)
  return pageIdx >= 0 ? pageIdx + 1 : null
}

/** 在当前页 ink span 列表中查找目标小节的墨迹条带（可按 part / ny 消歧）。 */
export function findInkSpanForMeasureOnPage(
  pageSpans: OsmdInkNormMeasureSpan[] | undefined,
  measureIndex0: number,
  options: { partIndex0?: number; nyHint?: number } = {},
): OsmdInkNormMeasureSpan | null {
  if (!pageSpans?.length || !Number.isFinite(measureIndex0)) return null
  const matches = pageSpans.filter((s) => s.measureListIndex === measureIndex0)
  if (!matches.length) return null

  const partIdx = options.partIndex0
  if (partIdx != null && Number.isFinite(partIdx) && partIdx >= 0) {
    const byPart = matches.filter((s) => s.partIndex0 === partIdx)
    if (byPart.length === 1) return byPart[0]!
    if (byPart.length > 1) {
      const ny = options.nyHint
      if (ny != null && Number.isFinite(ny)) {
        let best = byPart[0]!
        let bestD = verticalDistanceToSpanInk(best, ny)
        for (let i = 1; i < byPart.length; i += 1) {
          const s = byPart[i]!
          const d = verticalDistanceToSpanInk(s, ny)
          if (d < bestD) {
            bestD = d
            best = s
          }
        }
        return best
      }
      return byPart[0]!
    }
  }

  const ny = options.nyHint
  if (ny != null && Number.isFinite(ny) && matches.some(spanHasVerticalInk)) {
    let best = matches[0]!
    let bestD = verticalDistanceToSpanInk(best, ny)
    for (let i = 1; i < matches.length; i += 1) {
      const s = matches[i]!
      const d = verticalDistanceToSpanInk(s, ny)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  return matches[0]!
}

/** 将墨迹坐标换算为小节内的相对比例与顶边偏移。 */
export function measureInkFractionFromInkNorm(
  span: OsmdInkNormMeasureSpan,
  inkX: number,
  inkY: number,
): MeasureInkFraction {
  const w = Math.max(1e-6, span.right - span.left)
  const fracX = clamp01((inkX - span.left) / w)
  const spanTop = spanHasVerticalInk(span) ? (span.top as number) : 0
  const fraction: MeasureInkFraction = {
    fracX,
    inkDeltaYFromSpanTop: inkY - spanTop,
    domInkYNorm: inkY,
  }
  if (spanHasVerticalInk(span)) {
    const spanH = Math.max(1e-6, (span.bottom as number) - (span.top as number))
    fraction.vertFracY = (inkY - spanTop) / spanH
  }
  return fraction
}

/** 由小节内几何快照得到墨迹归一化坐标。 */
export function inkNormFromMeasureInkFraction(
  span: OsmdInkNormMeasureSpan,
  fraction: MeasureInkFraction,
): { x: number; y: number } {
  const w = Math.max(1e-6, span.right - span.left)
  const x = clamp01(span.left + fraction.fracX * w)
  let y: number
  if (fraction.vertFracY != null && Number.isFinite(fraction.vertFracY) && spanHasVerticalInk(span)) {
    const spanH = Math.max(1e-6, (span.bottom as number) - (span.top as number))
    y = (span.top as number) + fraction.vertFracY * spanH
  } else {
    const spanTop = spanHasVerticalInk(span) ? (span.top as number) : 0
    y = spanTop + fraction.inkDeltaYFromSpanTop
  }
  return { x, y: clamp01(y) }
}

export type ContainerInkNormMapper = (
  x: number,
  y: number,
  page1Based: number,
) => { x: number; y: number }

export function measureLayoutFieldsFromFraction(fraction: MeasureInkFraction): OsmdMeasureLayoutFields {
  return {
    anchorMeasureFracX: fraction.fracX,
    anchorMeasureInkDeltaY: fraction.inkDeltaYFromSpanTop,
    ...(fraction.vertFracY != null && Number.isFinite(fraction.vertFracY)
      ? { anchorMeasureVertFracY: fraction.vertFracY }
      : {}),
    ...(fraction.domInkYNorm != null && Number.isFinite(fraction.domInkYNorm)
      ? { anchorMeasureDomInkYNorm: fraction.domInkYNorm }
      : {}),
  }
}

export function measureInkFractionFromAnnotationRecord(
  ann: ScoreAnnotationRecord,
): MeasureInkFraction | null {
  const fracX = ann.anchorMeasureFracX
  if (fracX == null || !Number.isFinite(fracX)) return null
  return {
    fracX,
    inkDeltaYFromSpanTop:
      ann.anchorMeasureInkDeltaY != null && Number.isFinite(ann.anchorMeasureInkDeltaY)
        ? ann.anchorMeasureInkDeltaY
        : DEFAULT_INK_DELTA_Y_ABOVE_STAFF,
    vertFracY:
      ann.anchorMeasureVertFracY != null && Number.isFinite(ann.anchorMeasureVertFracY)
        ? ann.anchorMeasureVertFracY
        : undefined,
    domInkYNorm:
      ann.anchorMeasureDomInkYNorm != null && Number.isFinite(ann.anchorMeasureDomInkYNorm)
        ? ann.anchorMeasureDomInkYNorm
        : undefined,
  }
}

/**
 * 在已确定锚定小节后，把点击墨迹坐标固化为「相对该小节」的几何（不再用整页 x/y 作主数据）。
 */
export function captureOsmdMeasureLayoutForAnchor(
  measureIndex0: number,
  partIndex0: number | undefined,
  page1Based: number,
  pageMeasureIndexBounds: RendererPageMeasureBounds[],
  pageMeasureInkNormSpans: OsmdInkNormMeasureSpan[][],
  inkNorm: { x: number; y: number },
): { fraction: MeasureInkFraction; page: number } | null {
  const page = resolveRendererPageForMeasure(measureIndex0, pageMeasureIndexBounds) ?? page1Based
  const pageSpans = pageMeasureInkNormSpans[page - 1]
  const span = findInkSpanForMeasureOnPage(pageSpans, measureIndex0, {
    partIndex0,
    nyHint: inkNorm.y,
  })
  if (!span) return null
  const fraction = measureInkFractionFromInkNorm(span, inkNorm.x, inkNorm.y)
  fraction.domInkYNorm = inkNorm.y
  return { fraction, page }
}

/** 由锚定小节几何 + 当前 ink span / DOM 墨迹区，计算 overlay 用的 page/x/y。 */
export function projectOsmdAnnotationToContainer(
  ann: ScoreAnnotationRecord,
  pageMeasureIndexBounds: RendererPageMeasureBounds[],
  pageMeasureInkNormSpans: OsmdInkNormMeasureSpan[][],
  options: {
    inkToContainer?: RealignOsmdAnnotationsOptions['inkToContainer']
    containerToInk?: ContainerInkNormMapper
    fractionOverride?: MeasureInkFraction
  } = {},
): { page: number; x: number; y: number; fraction: MeasureInkFraction } | null {
  const mi = ann.anchorMeasureListIndex0
  if (mi == null || mi < 0) return null
  if (
    !pageMeasureIndexBounds.length ||
    pageMeasureInkNormSpans.length !== pageMeasureIndexBounds.length
  ) {
    return null
  }

  const newPage = resolveRendererPageForMeasure(mi, pageMeasureIndexBounds)
  if (newPage == null) return null

  const pageSpans = pageMeasureInkNormSpans[newPage - 1]
  let fraction = options.fractionOverride ?? measureInkFractionFromAnnotationRecord(ann)

  if (!fraction && options.containerToInk) {
    const ink = options.containerToInk(ann.x, ann.y, newPage)
    const inferSpan = findInkSpanForMeasureOnPage(pageSpans, mi, {
      partIndex0: ann.anchorXmlPartIndex0,
      nyHint: ink.y,
    })
    if (inferSpan) {
      fraction = measureInkFractionFromInkNorm(inferSpan, ink.x, ink.y)
    }
  }

  let nyHint: number | undefined
  if (fraction) {
    const probe = findInkSpanForMeasureOnPage(pageSpans, mi, {
      partIndex0: ann.anchorXmlPartIndex0,
    })
    if (probe && spanHasVerticalInk(probe)) {
      if (fraction.vertFracY != null && Number.isFinite(fraction.vertFracY)) {
        const spanH = Math.max(1e-6, (probe.bottom as number) - (probe.top as number))
        nyHint = (probe.top as number) + fraction.vertFracY * spanH
      } else {
        nyHint = (probe.top as number) + fraction.inkDeltaYFromSpanTop
      }
    } else if (fraction.domInkYNorm != null && Number.isFinite(fraction.domInkYNorm)) {
      nyHint = fraction.domInkYNorm
    }
  }

  const span = findInkSpanForMeasureOnPage(pageSpans, mi, {
    partIndex0: ann.anchorXmlPartIndex0,
    nyHint,
  })
  if (!span) return null

  if (!fraction) {
    fraction = {
      fracX: DEFAULT_MEASURE_INK_FRAC_X,
      inkDeltaYFromSpanTop: DEFAULT_INK_DELTA_Y_ABOVE_STAFF,
    }
  }

  const inkPos = inkNormFromMeasureInkFraction(span, fraction)
  // 纵向以锚定小节/part 的 span 为准；勿用整页 domInkYNorm 覆盖（排版变化后会偏到其它谱表行）。
  const inkY = inkPos.y
  const container = options.inkToContainer?.(inkPos.x, inkY, newPage)
  return {
    page: newPage,
    x: container ? container.x : inkPos.x,
    y: container ? container.y : inkPos.y,
    fraction,
  }
}

/**
 * 应用排版前：把当前 overlay 坐标转为各标注在小节墨迹内的相对比例并缓存。
 */
export function snapshotOsmdAnnotationMeasureInkFractions(
  annotations: ScoreAnnotationRecord[],
  pageInkSpans: OsmdInkNormMeasureSpan[][],
  containerToInk: ContainerInkNormMapper,
): Map<string, MeasureInkFraction> {
  const out = new Map<string, MeasureInkFraction>()
  for (const ann of annotations) {
    const mi = ann.anchorMeasureListIndex0
    if (mi == null || mi < 0) continue
    const stored = measureInkFractionFromAnnotationRecord(ann)
    if (stored) {
      out.set(ann.id, stored)
      continue
    }
    const pg = Math.max(1, Math.round(ann.page))
    const pageSpans = pageInkSpans[pg - 1]
    if (!pageSpans?.length) continue
    const ink = containerToInk(ann.x, ann.y, pg)
    const span = findInkSpanForMeasureOnPage(pageSpans, mi, {
      partIndex0: ann.anchorXmlPartIndex0,
      nyHint: ink.y,
    })
    if (span) {
      const fraction = measureInkFractionFromInkNorm(span, ink.x, ink.y)
      fraction.domInkYNorm = ink.y
      out.set(ann.id, fraction)
    } else {
      out.set(ann.id, {
        fracX: DEFAULT_MEASURE_INK_FRAC_X,
        inkDeltaYFromSpanTop: DEFAULT_INK_DELTA_Y_ABOVE_STAFF,
      })
    }
  }
  return out
}

export type RealignOsmdAnnotationsOptions = {
  /** 应用排版前快照；优先使用以保留用户点击位置。 */
  fractionById?: Map<string, MeasureInkFraction>
  /** 无快照时，用当前 overlay 坐标反推小节内比例（布局未变时近似恒等）。 */
  containerToInk?: ContainerInkNormMapper
  /** 墨迹 → 容器；缺省时用墨迹坐标直接作为 overlay x/y（略偏左上的系统误差）。 */
  inkToContainer?: (
    inkX: number,
    inkY: number,
    page1Based: number,
  ) => { x: number; y: number } | null
}

/**
 * OSMD 分页/页宽变化后，按 `anchorMeasureListIndex0` 将标注重投影到新 ink span 上。
 */
export function realignOsmdAnnotationsAfterLayoutChange(
  annotations: ScoreAnnotationRecord[],
  pageMeasureIndexBounds: RendererPageMeasureBounds[],
  pageMeasureInkNormSpans: OsmdInkNormMeasureSpan[][],
  options: RealignOsmdAnnotationsOptions = {},
): ScoreAnnotationRecord[] {
  if (!pageMeasureIndexBounds.length || pageMeasureInkNormSpans.length !== pageMeasureIndexBounds.length) {
    return annotations
  }

  const { fractionById, containerToInk, inkToContainer } = options

  return annotations.map((ann) => {
    const mi = ann.anchorMeasureListIndex0
    if (mi == null || mi < 0) return ann

    const projected = projectOsmdAnnotationToContainer(
      ann,
      pageMeasureIndexBounds,
      pageMeasureInkNormSpans,
      {
        inkToContainer,
        containerToInk,
        fractionOverride: fractionById?.get(ann.id),
      },
    )
    if (!projected) {
      const newPage = resolveRendererPageForMeasure(mi, pageMeasureIndexBounds)
      return newPage != null && newPage !== ann.page ? { ...ann, page: newPage } : ann
    }

    const { page, x, y, fraction: fractionOut } = projected
    const layoutFields = measureLayoutFieldsFromFraction(fractionOut)
    if (
      page === ann.page &&
      Math.abs(x - ann.x) < 1e-5 &&
      Math.abs(y - ann.y) < 1e-5 &&
      ann.anchorMeasureFracX === layoutFields.anchorMeasureFracX &&
      ann.anchorMeasureInkDeltaY === layoutFields.anchorMeasureInkDeltaY &&
      ann.anchorMeasureVertFracY === layoutFields.anchorMeasureVertFracY &&
      ann.anchorMeasureDomInkYNorm === layoutFields.anchorMeasureDomInkYNorm
    ) {
      return ann
    }
    return { ...ann, page, x, y, ...layoutFields }
  })
}
