import type { ScoreAnnotationRecord } from '@/lib/scoreCache'
import type { ScoreRenderEngine } from '@/stores/scoreUi'
import {
  patchMusicXmlPageLayoutTenths,
} from '@/lib/osmd'
import {
  formatAnnotationText,
  getInstrumentAnnotationIcon,
  isInstrumentAnnotationShortcut,
} from '@/lib/instrumentAnnotations'
import { annotationDebugLog } from '@/lib/annotationDebug'
import {
  buildPartNoteTimeline,
  chordHeadNote,
  chordTailNote,
  getMeasureEndDivisions,
  listScorePartElements,
  orderedChordHeadsFromTimeline,
  mapRendererPageToFirstMeasureIndex,
  pickTimedNoteForAnchorTick,
  pickTimedNoteForAnnotationRecord,
  printedPageIndexForPartMeasure,
  spreadTimedNotePickForExport,
  type OsmdInkNormMeasureSpan,
  type OsmdMusicSystemNormBounds,
  type RendererPageMeasureBounds,
  type TimedNoteEl,
} from '@/lib/musicXmlNoteAnchors'

/** 本应用写入的 direction 的 id 前缀（便于剥离与识别） */
export const FLS_ANNOTATION_DIRECTION_ID_PREFIX = 'fls-ann-'

/** 标注元数据所在 XML 命名空间（写在每个 `<direction>` 上，不写入 miscellaneous） */
export const FLS_ANNOTATION_NS = 'http://five-line-staff.local/ns/annotation/1'
const FLS_PREFIX = 'fls'
const XMLNS_DECL_NS = 'http://www.w3.org/2000/xmlns/'

/** 与 Sibelius「音乐学院」参考及本应用导出一致的 `<words>` 排版指纹（跨 MuseScore 等） */
const INTERCHANGE_CUE_FONT_SIZE = '5.9688'

/** 旧导出：identification 中的 JSON 字段名（仅解析兼容，不再写入） */
export const FLS_ANNOTATIONS_MISC_FIELD_NAME = 'five-line-staff-annotations'

/** 文件头 `<!-- five-line-staff-ui:{json} -->` 中的 JSON 键前缀（与 {@link injectFiveLineStaffUiComment} 成对） */
export const FLS_UI_COMMENT_MARKER = 'five-line-staff-ui:'

export interface ParsedFiveLineStaffUiComment {
  renderEngine?: ScoreRenderEngine
  osmdPageWidth?: number
  verovioPageWidth?: number
  osmdManualPageWidthTenths?: number
  osmdManualPageHeightTenths?: number
}

export interface ParsedEmbeddedAnnotations {
  annotations: ScoreAnnotationRecord[]
  verovioPageWidth: number | null
  /** OSMD 离屏宿主宽度（px）；主要来自文件头注释或旧 miscellaneous JSON */
  osmdPageWidth: number | null
  renderEngine?: ScoreRenderEngine | null
}

function captureXmlPreamble(original: string): { decl: string; doctype: string } {
  const declRaw = original.match(/^<\?xml[^?]*\?>\s*/)?.[0]
  const decl = (declRaw?.trim() ? `${declRaw.trim()}\n` : '<?xml version="1.0" encoding="UTF-8"?>\n').replace(
    /\n{2,}/g,
    '\n',
  )
  const doctype = original.match(/<!DOCTYPE[^>]*>\s*/i)?.[0] ?? ''
  return { decl, doctype }
}

/**
 * 解析导出文件开头的 `<!-- five-line-staff-ui:{...} -->`，恢复渲染引擎与页面宽度。
 */
export function parseFiveLineStaffUiComment(xml: string): ParsedFiveLineStaffUiComment | null {
  const m = xml.match(/<!--\s*five-line-staff-ui:\s*(\{[\s\S]*?\})\s*-->/)
  if (!m?.[1]) return null
  try {
    const o = JSON.parse(m[1]) as Record<string, unknown>
    const reRaw = o.renderEngine
    const renderEngine =
      reRaw === 'verovio' || reRaw === 'osmd' ? (reRaw as ScoreRenderEngine) : undefined
    const ow = Number(o.osmdPageWidth)
    const osmdPageWidth = Number.isFinite(ow) ? Math.round(ow) : undefined
    const vw = Number(o.verovioPageWidth)
    const verovioPageWidth = Number.isFinite(vw) ? Math.round(vw) : undefined
    const mwt = Number(o.osmdManualPageWidthTenths)
    const osmdManualPageWidthTenths = Number.isFinite(mwt) && mwt > 0 ? mwt : undefined
    const mht = Number(o.osmdManualPageHeightTenths)
    const osmdManualPageHeightTenths = Number.isFinite(mht) && mht > 0 ? mht : undefined
    if (
      renderEngine === undefined &&
      osmdPageWidth === undefined &&
      verovioPageWidth === undefined &&
      osmdManualPageWidthTenths === undefined &&
      osmdManualPageHeightTenths === undefined
    ) {
      return null
    }
    return {
      ...(renderEngine !== undefined ? { renderEngine } : {}),
      ...(osmdPageWidth !== undefined ? { osmdPageWidth } : {}),
      ...(verovioPageWidth !== undefined ? { verovioPageWidth } : {}),
      ...(osmdManualPageWidthTenths !== undefined ? { osmdManualPageWidthTenths } : {}),
      ...(osmdManualPageHeightTenths !== undefined ? { osmdManualPageHeightTenths } : {}),
    }
  } catch {
    return null
  }
}

/**
 * 在 XML 声明与根元素之间写入（或替换）`five-line-staff-ui` 注释块。
 */
export function injectFiveLineStaffUiComment(
  xml: string,
  meta: {
    renderEngine: ScoreRenderEngine
    osmdPageWidth: number
    verovioPageWidth: number
    osmdManualPageWidthTenths?: number
    osmdManualPageHeightTenths?: number
  },
): string {
  const { decl, doctype } = captureXmlPreamble(xml)
  const preambleLen = decl.length + doctype.length
  let rest = xml.slice(preambleLen).trimStart()
  rest = rest.replace(/^<!--\s*five-line-staff-ui:\s*\{[\s\S]*?\}\s*-->\s*/m, '')
  const payload: Record<string, unknown> = {
    renderEngine: meta.renderEngine,
    osmdPageWidth: meta.osmdPageWidth,
    verovioPageWidth: meta.verovioPageWidth,
  }
  if (
    typeof meta.osmdManualPageWidthTenths === 'number' &&
    Number.isFinite(meta.osmdManualPageWidthTenths) &&
    meta.osmdManualPageWidthTenths > 0
  ) {
    payload.osmdManualPageWidthTenths = meta.osmdManualPageWidthTenths
  }
  if (
    typeof meta.osmdManualPageHeightTenths === 'number' &&
    Number.isFinite(meta.osmdManualPageHeightTenths) &&
    meta.osmdManualPageHeightTenths > 0
  ) {
    payload.osmdManualPageHeightTenths = meta.osmdManualPageHeightTenths
  }
  const comment = `<!-- five-line-staff-ui:${JSON.stringify(payload)} -->\n`
  return `${decl}${doctype}${comment}${rest}`.trimEnd()
}

function mergeEmbeddedUiFields(xml: string, embedded: ParsedEmbeddedAnnotations): ParsedEmbeddedAnnotations {
  const c = parseFiveLineStaffUiComment(xml)
  const base: ParsedEmbeddedAnnotations = {
    ...embedded,
    osmdPageWidth: embedded.osmdPageWidth ?? null,
  }
  if (!c) return base
  return {
    annotations: base.annotations,
    verovioPageWidth:
      typeof c.verovioPageWidth === 'number' && Number.isFinite(c.verovioPageWidth)
        ? c.verovioPageWidth
        : base.verovioPageWidth,
    osmdPageWidth:
      typeof c.osmdPageWidth === 'number' && Number.isFinite(c.osmdPageWidth)
        ? c.osmdPageWidth
        : base.osmdPageWidth,
    renderEngine: c.renderEngine ?? base.renderEngine ?? null,
  }
}

/**
 * 仅剥离 `id="fls-ann-*"` 的 `<direction>`（本应用导出），保留 Sibelius/MuseScore 等无该 id 的
 * `<direction><words>`，以便 OSMD 按 MusicXML 原生排版绘制；若一并剥离再用 overlay 近似坐标会错位。
 */
function removeEmbeddedAnnotationDirections(doc: Document) {
  for (const el of Array.from(doc.getElementsByTagName('direction'))) {
    const id = el.getAttribute('id') ?? ''
    if (id.startsWith(FLS_ANNOTATION_DIRECTION_ID_PREFIX)) {
      el.parentNode?.removeChild(el)
    }
  }
}

/** 旧版导出会在根上声明 `xmlns:fls`；在已无任一 `fls:*` 属性时去掉，避免非标准命名空间残留 */
function pruneUnusedFlsNamespaceFromRoot(doc: Document) {
  const root = doc.documentElement
  if (!root) return
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    for (let i = 0; i < el.attributes.length; i += 1) {
      if (el.attributes[i]!.namespaceURI === FLS_ANNOTATION_NS) return
    }
  }
  if (root.hasAttributeNS(XMLNS_DECL_NS, 'fls')) root.removeAttributeNS(XMLNS_DECL_NS, 'fls')
  if (root.hasAttribute('xmlns:fls')) root.removeAttribute('xmlns:fls')
}

/** 在根元素声明 `xmlns:fls`，以便在 `<direction>` 上写 `fls:measureIndex0` 等属性并可被 `getFlsAttr` 读回。 */
function ensureFlsAnnotationXmlnsOnRoot(doc: Document): void {
  const root = doc.documentElement
  if (!root) return
  if (!root.hasAttributeNS(XMLNS_DECL_NS, 'fls')) {
    root.setAttributeNS(XMLNS_DECL_NS, 'xmlns:fls', FLS_ANNOTATION_NS)
  }
}

function removeFlsMiscellaneousField(doc: Document) {
  for (const el of Array.from(doc.getElementsByTagName('miscellaneous-field'))) {
    if (el.getAttribute('name') === FLS_ANNOTATIONS_MISC_FIELD_NAME) {
      const parent = el.parentNode
      parent?.removeChild(el)
      if (parent && parent.nodeName === 'miscellaneous' && parent.childNodes.length === 0) {
        parent.parentNode?.removeChild(parent)
      }
    }
  }
}

function getFlsAttr(el: Element, localName: string): string | null {
  const byNs = el.getAttributeNS(FLS_ANNOTATION_NS, localName)
  if (byNs !== null && byNs !== '') return byNs
  const legacy = el.getAttribute(`${FLS_PREFIX}:${localName}`)
  if (legacy !== null && legacy !== '') return legacy
  const attrs = el.attributes
  for (let i = 0; i < attrs.length; i += 1) {
    const a = attrs[i]
    if (a.namespaceURI === FLS_ANNOTATION_NS && a.localName === localName && a.value.trim() !== '') {
      return a.value
    }
  }
  return null
}

function wordsDisplayText(ann: ScoreAnnotationRecord): string {
  return ann.text
}

function createEl(doc: Document, localName: string): Element {
  const ns = doc.documentElement?.namespaceURI
  return ns ? doc.createElementNS(ns, localName) : doc.createElement(localName)
}

/** 小节内第一颗和弦头 `<note>`（用于无锚点时的 words 参照） */
function getFirstNoteHeadInMeasure(measure: Element): Element | null {
  for (const c of Array.from(measure.children)) {
    if (c.localName === 'note') return chordHeadNote(c)
  }
  return null
}

/** 与「音乐学院」参考里导播类 `<words>` 一致：default-y 多落在约 59–76，极少高于 78 */
/** MuseScore / Sibelius 常见的 <words default-y> 范围，覆盖大多数常规和弦头/休止符 */
const EXPORT_WORDS_DEFAULT_Y_MIN = 50
const EXPORT_WORDS_DEFAULT_Y_MAX = 85
/** 锚点音符 default-y 到标注 baseline 的固定偏移，与导播2（-14 → 61）一致 */
const EXPORT_WORDS_DY_BASE = 75

/**
 * 与音乐学院一致：`<words default-x/y>` 与锚点音符同一 tenths 系（如导播1 的 127≈125、导播2 的 13≈15），
 * 不再使用 `(ann.x - 0.5) * spanX` 视口公式——该公式在 ann.x > 0.5 时使 default-x > noteDx，
 * 导致 MuseScore 将标注渲染在锚点音符右侧而非左侧，与通用五线谱软件不兼容。
 */
function buildWordsDefaultXYForExport(
  _ann: ScoreAnnotationRecord,
  anchorNote: Element | null,
  measure: Element,
): { defaultX: number; defaultY: number } {
  const mwRaw = Number(measure.getAttribute('width'))
  const mw = Number.isFinite(mwRaw) && mwRaw > 24 ? mwRaw : 280

  let noteDx = 15
  let noteDy = -14
  if (anchorNote) {
    const ndx = Number(anchorNote.getAttribute('default-x'))
    const ndy = Number(anchorNote.getAttribute('default-y'))
    if (Number.isFinite(ndx)) noteDx = ndx
    if (Number.isFinite(ndy)) noteDy = ndy
  }

  // 标注始终放置在锚点音符左侧 2 tenths，与 Sibelius/MuseScore 原生标注一致
  const defaultX = Math.round(Math.max(6, Math.min(mw - 6, noteDx - 2)))

  // 竖直方向：以锚点音符为基准向上 75 tenths，与导播2（-14 → 61）一致
  const defaultY = Math.round(
    Math.max(
      EXPORT_WORDS_DEFAULT_Y_MIN,
      Math.min(
        EXPORT_WORDS_DEFAULT_Y_MAX,
        noteDy + EXPORT_WORDS_DY_BASE,
      ),
    ),
  )

  return { defaultX: defaultX, defaultY: defaultY }
}

/**
 * 将本应用导出时写入的 `<words default-x/y>` 反解为 overlay 的归一化 (x,y)。
 *
 * ⚠️ 新公式（跨软件兼容版本）不再将 ann.x/ann.y 编码到 default-x/y 中，
 * 而是使用固定偏移（default-x = noteDx - 2, default-y = noteDy + 75）。
 * 因此本函数仅作为 fallback 返回合理默认值——实际 overlay 坐标应从
 * `<direction>` 的 `fls:nx/fls:ny` 属性读取（调用方优先使用那条路径）。
 */
function inferNormXYByInvertingExportWords(
  _measure: Element,
  _words: Element,
  _anchorNote: Element,
): { x: number; y: number } | null {
  // 新公式不编码 x/y，调用方应依赖 fls:nx/ny 属性。
  // 此处返回视口中心作为 fallback（仅对旧导出生效）。
  return { x: 0.5, y: 0.2 }
}

/**
 * 写入与 Sibelius / MuseScore 兼容的 `<direction>`：标准 `<words default-x/y>` 给其它软件；
 * `id="fls-ann-*"` 供本应用剥离。另在 `xmlns:fls` 命名空间下写 `page`/`nx`/`ny`（与屏上 overlay 同一套
 * 0~1 归一化坐标及 OSMD 页码），避免重开文件时仅靠 tenths 反推与 OSMD 墨迹坐标不一致而「位置乱了」。
 */
function buildFlsDirectionElement(
  doc: Document,
  ann: ScoreAnnotationRecord,
  options: {
    /** 与 `<offset sound="no">` 一致：小节内 divisions；为 0 时可省略（与音乐学院参考一致） */
    directionOffsetDivisions: number
    wordsDefaultX: number
    wordsDefaultY: number
    /**
     * OSMD 等在导出阶段重算锚点后传入，写入 `fls:measureIndex0`；
     * 缺省时仍用 `ann.anchorMeasureListIndex0`（如 Verovio 仅依赖点击 tick 路径）。
     */
    measureListIndex0Override?: number
    /** 写入 `fls:renderEngine`，重开时解析用 */
    renderEngine?: ScoreRenderEngine | null
  },
): Element {
  const rawId = ann.id.replace(new RegExp(`^${FLS_ANNOTATION_DIRECTION_ID_PREFIX}`), '')
  const dir = createEl(doc, 'direction')
  dir.setAttribute('id', `${FLS_ANNOTATION_DIRECTION_ID_PREFIX}${rawId}`)
  const overrideMi = options.measureListIndex0Override
  const ixFromOverride =
    typeof overrideMi === 'number' && Number.isFinite(overrideMi) && overrideMi >= 0
      ? Math.round(overrideMi)
      : null
  const ixFromAnn =
    Number.isFinite(ann.anchorMeasureListIndex0) && (ann.anchorMeasureListIndex0 as number) >= 0
      ? Math.round(Number(ann.anchorMeasureListIndex0))
      : null
  const ix = ixFromAnn ?? ixFromOverride
  if (ix !== null && ix >= 0) {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'measureIndex0', String(ix))
  }
  if (Number.isFinite(ann.anchorXmlPartIndex0) && (ann.anchorXmlPartIndex0 as number) >= 0) {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'partIndex0', String(Math.round(Number(ann.anchorXmlPartIndex0))))
  }

  const pg = Math.max(1, Math.round(Number.isFinite(ann.page) ? Number(ann.page) : 1))
  dir.setAttributeNS(FLS_ANNOTATION_NS, 'page', String(pg))
  dir.setAttributeNS(FLS_ANNOTATION_NS, 'nx', String(clamp01(Number.isFinite(ann.x) ? ann.x : 0.5)))
  dir.setAttributeNS(FLS_ANNOTATION_NS, 'ny', String(clamp01(Number.isFinite(ann.y) ? ann.y : 0.5)))
  if (Number.isFinite(ann.anchorMeasureFracX)) {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'fracX', String(ann.anchorMeasureFracX))
  }
  if (Number.isFinite(ann.anchorMeasureInkDeltaY)) {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'inkDeltaY', String(ann.anchorMeasureInkDeltaY))
  }
  if (Number.isFinite(ann.anchorMeasureVertFracY)) {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'vertFracY', String(ann.anchorMeasureVertFracY))
  }
  if (Number.isFinite(ann.anchorTickStart)) {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'anchorTick', String(Math.round(Number(ann.anchorTickStart))))
  }
  const re = options.renderEngine
  if (re === 'verovio' || re === 'osmd') {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'renderEngine', re)
  }
  if (ann._dbgBounds && ann._dbgBounds.length > 0) {
    dir.setAttributeNS(FLS_ANNOTATION_NS, 'dbgBounds', ann._dbgBounds)
  }

  const dt = createEl(doc, 'direction-type')
  const words = createEl(doc, 'words')
  words.textContent = wordsDisplayText(ann)
  words.setAttribute('default-x', String(options.wordsDefaultX))
  words.setAttribute('default-y', String(options.wordsDefaultY))
  words.setAttribute('justify', 'left')
  words.setAttribute('valign', 'middle')
  words.setAttribute('font-family', 'Palatino Linotype')
  words.setAttribute('font-style', 'normal')
  words.setAttribute('font-size', INTERCHANGE_CUE_FONT_SIZE)
  words.setAttribute('font-weight', 'bold')
  if (ann.color && /^#[0-9A-Fa-f]{6}$/i.test(ann.color)) {
    const low = ann.color.toLowerCase()
    if (low !== '#000000') {
      words.setAttribute('color', ann.color)
    }
  }
  dt.appendChild(words)
  dir.appendChild(dt)
  const offRounded = Math.round(options.directionOffsetDivisions)
  if (offRounded !== 0) {
    const offsetEl = createEl(doc, 'offset')
    offsetEl.setAttribute('sound', 'no')
    offsetEl.textContent = String(offRounded)
    dir.appendChild(offsetEl)
  }
  const voice = createEl(doc, 'voice')
  voice.textContent = '1'
  dir.appendChild(voice)
  const staff = createEl(doc, 'staff')
  staff.textContent = '1'
  dir.appendChild(staff)
  return dir
}

function findAncestorMeasure(el: Element | null): Element | null {
  let walk: Element | null = el
  while (walk) {
    if (walk.localName === 'measure') return walk
    walk = walk.parentElement
  }
  return null
}

function insertFlsDirectionForAnnotation(
  ann: ScoreAnnotationRecord,
  dir: Element,
  timeline: TimedNoteEl[],
  fallback: { measures: Element[]; totalPages: number; rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null },
  prePicked: TimedNoteEl | null,
) {
  const { measures, totalPages, rendererPageMeasureBounds } = fallback
  if (measures.length === 0) return

  const annId = ann.id ?? 'unknown'
  const annText = (dir.querySelector('words') as Element)?.textContent ?? 'no-words'
  annotationDebugLog('export:insertDirection:start', {
    annText,
    annId,
    page: ann.page,
    x: ann.x,
    y: ann.y,
    anchorTickStart: ann.anchorTickStart,
    anchorMeasureListIndex0: ann.anchorMeasureListIndex0,
    anchorXmlPartIndex0: ann.anchorXmlPartIndex0,
    prePicked: prePicked !== null,
    measureCount: measures.length,
  })

  // === 决策优先级（与 withEmbeddedAnnotations 同步）===
  // 1. 优先使用标注保存的 anchorMeasureListIndex0（最可靠，直接来自点击/标注时的小节索引）
  // 2. 使用 prePicked / anchorTickStart 计算出的 picked（仅当无 stored-anchor 时）
  // 3. 回退到 page 计算

  // 路径 A：有 stored anchor measure index → 直接用
  if (ann.anchorMeasureListIndex0 != null && Number.isFinite(ann.anchorMeasureListIndex0) && ann.anchorMeasureListIndex0 >= 0 && ann.anchorMeasureListIndex0 < measures.length) {
    const mi = Math.round(ann.anchorMeasureListIndex0)
    const targetMeasure = measures[mi]
    if (targetMeasure) {
      if (prePicked) {
        const mPick = findAncestorMeasure(prePicked.note)
        if (mPick === targetMeasure) {
          const head = chordHeadNote(prePicked.note)
          targetMeasure.insertBefore(dir, head)
          annotationDebugLog('export:insertDirection:pathA', { path: 'insertBefore-prePicked-head', mi })
          return
        }
      }
      const firstNote = targetMeasure.querySelector('note')
      if (firstNote) {
        targetMeasure.insertBefore(dir, firstNote)
        annotationDebugLog('export:insertDirection:pathA', { path: 'insertBefore-firstNote', mi })
        return
      } else {
        targetMeasure.appendChild(dir)
        annotationDebugLog('export:insertDirection:pathA', { path: 'appendChild-no-note', mi })
        return
      }
    }
    annotationDebugLog('export:insertDirection:pathA-fail', { mi, reason: 'empty-measure' })
  } else {
    annotationDebugLog('export:insertDirection:pathA-skip', {
      anchorMeasureListIndex0: ann.anchorMeasureListIndex0,
      measuresLen: measures.length,
    })
  }

  // 路径 B：使用 prePicked 或重新计算
  const picked =
    prePicked ??
    (Number.isFinite(ann.anchorTickStart) && timeline.length > 0
      ? pickTimedNoteForAnchorTick(timeline, ann.anchorTickStart as number)
      : null)

  if (picked) {
    const measure = findAncestorMeasure(picked.note)
    if (measure) {
      const head = chordHeadNote(picked.note)
      /** 与音乐学院参考一致：标在目标音符之前，避免小节最后一个音时 `insertBefore(..., null)` 把多条 direction 全堆在 `</measure>` 前 */
      measure.insertBefore(dir, head)
      annotationDebugLog('export:insertDirection:pathB', {
        tick: ann.anchorTickStart ?? (prePicked ? 'prePicked' : 'none'),
        measureNumber: getMeasureNumber(measure),
      })
      return
    }
    annotationDebugLog('export:insertDirection:pathB-fail', { reason: 'no-measure-for-picked' })
  } else {
    annotationDebugLog('export:insertDirection:pathB-skip', {
      prePicked: prePicked !== null,
      anchorTickStart: ann.anchorTickStart,
      timelineLen: timeline.length,
    })
  }

  // 路径 C：最终回退 — 按 page 计算目标小节
  const mi = mapRendererPageToFirstMeasureIndex(ann.page, totalPages, measures.length, rendererPageMeasureBounds ?? null)
  if (mi >= 0 && mi < measures.length) {
    const targetMeasure = measures[mi]
    if (targetMeasure) {
      const firstNote = targetMeasure.querySelector('note')
      if (firstNote) {
        targetMeasure.insertBefore(dir, firstNote)
        annotationDebugLog('export:insertDirection:pathC', { path: 'insertBefore-firstNote', mi })
      } else {
        targetMeasure.appendChild(dir)
        annotationDebugLog('export:insertDirection:pathC', { path: 'appendChild-no-note', mi })
      }
    }
  } else {
    annotationDebugLog('export:insertDirection:pathC-skip', { mi, measuresLen: measures.length })
  }
}

// 辅助：获取 measure 的 number 属性
function getMeasureNumber(measure: Element): string {
  return measure.getAttribute('number') ?? 'unknown'
}

function parseMiscJson(text: string): ParsedEmbeddedAnnotations | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const annotations = Array.isArray(parsed.annotations) ? parsed.annotations : null
    if (!annotations) return null
    const verovioPageWidthRaw = Number(parsed.verovioPageWidth)
    const verovioPageWidth = Number.isFinite(verovioPageWidthRaw) ? Math.round(verovioPageWidthRaw) : null
    const osmdPageWidthRaw = Number(parsed.osmdPageWidth)
    const osmdPageWidth = Number.isFinite(osmdPageWidthRaw) ? Math.round(osmdPageWidthRaw) : null
    const re = parsed.renderEngine
    const renderEngine = re === 'verovio' || re === 'osmd' ? re : null
    return {
      annotations: normalizeAnnotationRecords(annotations as unknown[]),
      verovioPageWidth,
      osmdPageWidth,
      renderEngine,
    }
  } catch {
    return null
  }
}

function tryParseFromMiscellaneous(doc: Document): ParsedEmbeddedAnnotations | null {
  for (const el of Array.from(doc.getElementsByTagName('miscellaneous-field'))) {
    if (el.getAttribute('name') !== FLS_ANNOTATIONS_MISC_FIELD_NAME) continue
    const text = el.textContent?.trim() ?? ''
    if (!text) continue
    const out = parseMiscJson(text)
    if (out) return out
  }
  return null
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** MusicXML 常见 `#RRGGBB` / `#RGB` */
function parseMusicXmlHexColorAttr(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t.toLowerCase()
  if (/^#[0-9A-Fa-f]{3}$/i.test(t)) {
    const r = t[1]!,
      g = t[2]!,
      b = t[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return null
}

/**
 * 与 MuseScore 一致：颜色以 `<words>` / `<direction-type>` / `<direction>` 上 `color` 为准；
 * 未声明时视为默认黑色（不写 XML 时亦为黑）。
 */
function parseAnnotationColorFromDirectionGroup(dir: Element, words: Element | undefined): string {
  const fromWords = parseMusicXmlHexColorAttr(words?.getAttribute('color'))
  if (fromWords) return fromWords
  const dt = dir.getElementsByTagName('direction-type')[0]
  const fromDt = parseMusicXmlHexColorAttr(dt?.getAttribute('color'))
  if (fromDt) return fromDt
  const fromDir = parseMusicXmlHexColorAttr(dir.getAttribute('color'))
  if (fromDir) return fromDir
  return '#000000'
}

/** 同一小节内、紧邻 direction 之前的最近一颗和弦头 `<note>` */
function getPrecedingAnchorNote(direction: Element): Element | null {
  let s: Element | null = direction.previousElementSibling
  while (s) {
    if (s.localName === 'note') return chordHeadNote(s)
    s = s.previousElementSibling
  }
  return null
}

/** 同一小节内、紧邻 direction 之后的最近一颗和弦头 `<note>` */
function getFollowingAnchorNote(direction: Element): Element | null {
  let s: Element | null = direction.nextElementSibling
  while (s) {
    if (s.localName === 'note') return chordHeadNote(s)
    s = s.nextElementSibling
  }
  return null
}

/**
 * 无 `fls:nx/ny` 时，用 MusicXML 小节宽度 + 前后乐符的 `default-x` 把 `<words>` 的 tenths 映射到页内归一化 x；
 * 竖直方向结合锚点音符的 `default-y`（若存在）与 words 的 `default-y`。
 *
 * 注意：`<direction>` 常写在锚点 `<note>` **之前**，但 `<words default-x>` 仍可能是**整小节 tenths**（可大于休止符
 * `default-x="15"`）。若把插值右界误设为「仅锚点 x」，则 wDx=29、note=15 会得到 t>1，overlay 被夹到页边错位。
 */
function inferNormXYFromMusicXmlDirectionContext(
  dir: Element,
  measure: Element,
  words: Element,
): { x: number; y: number } {
  const mwRaw = Number(measure.getAttribute('width'))
  const mw = Number.isFinite(mwRaw) && mwRaw > 24 ? mwRaw : 280

  const wDx = Number(words.getAttribute('default-x'))
  const wDy = Number(words.getAttribute('default-y'))

  const prevNote = getPrecedingAnchorNote(dir)
  const nextNote = getFollowingAnchorNote(dir)

  let left = 6
  if (prevNote) {
    const tail = chordTailNote(prevNote)
    const v = Number(tail.getAttribute('default-x'))
    if (Number.isFinite(v)) left = v
  }
  let right = mw - 6
  if (nextNote) {
    const anchorX = Number(nextNote.getAttribute('default-x'))
    if (Number.isFinite(anchorX)) {
      if (Number.isFinite(wDx) && wDx > anchorX + 1) {
        left = Math.min(left, anchorX)
        right = mw - 6
      } else {
        right = anchorX
      }
    }
  }

  let x: number
  if (Number.isFinite(wDx)) {
    if (Number.isFinite(right) && Number.isFinite(left) && right > left + 4) {
      const t = Math.max(0, Math.min(1, (wDx - left) / (right - left)))
      x = clamp01(0.03 + 0.94 * t)
    } else {
      x = clamp01(wDx / mw)
    }
  } else {
    x = 0.5
  }

  const anchor = nextNote ?? prevNote
  let nDy = anchor ? Number(anchor.getAttribute('default-y')) : Number.NaN
  if (!Number.isFinite(nDy)) {
    nDy = -10
  }
  let y: number
  if (Number.isFinite(wDy)) {
    y = clamp01(0.52 - (wDy * 0.58 + nDy * 0.42) / 130)
  } else {
    y = 0.5
  }
  return { x, y }
}

/** 旧式线性反推（无小节/前后文时兜底） */
function wordsElementToNormXY(words: Element | undefined): { x: number; y: number } {
  const dx = Number(words?.getAttribute('default-x'))
  const dy = Number(words?.getAttribute('default-y'))
  const x = Number.isFinite(dx) ? clamp01((dx - 20) / 220) : 0.5
  const y = Number.isFinite(dy) ? clamp01(0.5 - dy / 140) : 0.5
  return { x, y }
}

/**
 * 仅从 `<direction id="fls-ann-*">` 解析本应用标注（含旧版 `fls:*`）。
 * 无该 id 的第三方 `<direction>` 不进入 overlay，交由 OSMD 在谱面 SVG 中原样渲染以保证位置正确。
 */
function tryParseFromFlsDirections(doc: Document, totalPages: number): ParsedEmbeddedAnnotations {
  const allParts = listScorePartElements(doc)
  const firstPart = allParts[0]
  const measures = firstPart ? Array.from(firstPart.children).filter((el) => el.localName === 'measure') : []
  const totalMeasures = measures.length
  const out: ScoreAnnotationRecord[] = []
  const slice = totalMeasures > 0 && totalPages > 0 ? totalMeasures / totalPages : totalMeasures
  let verovioPageWidth: number | null = null
  let renderEngine: ScoreRenderEngine | null = null

  let maxPrintedPage = 1
  for (let i = 0; i < measures.length; i += 1) {
    maxPrintedPage = Math.max(maxPrintedPage, printedPageIndexForPartMeasure(measures, i))
  }
  const useSlicePageFallback = totalPages > 1 && maxPrintedPage === 1 && totalMeasures > 0

  for (let pi = 0; pi < allParts.length; pi += 1) {
    const partEl = allParts[pi]!
    const measuresThis = Array.from(partEl.children).filter((el) => el.localName === 'measure')
    for (let mi = 0; mi < measuresThis.length; mi += 1) {
      const measure = measuresThis[mi]!
      for (const dir of Array.from(measure.getElementsByTagName('direction'))) {
        const id = dir.getAttribute('id') ?? ''
        const isFls = id.startsWith(FLS_ANNOTATION_DIRECTION_ID_PREFIX)
        if (!isFls) continue

        const pwRaw = getFlsAttr(dir, 'verovioPageWidth')
        if (pwRaw !== null) {
          const n = Number(pwRaw)
          if (Number.isFinite(n)) verovioPageWidth = Math.round(n)
        }
        const reRaw = getFlsAttr(dir, 'renderEngine')
        if (reRaw === 'verovio' || reRaw === 'osmd') {
          renderEngine = reRaw
        }

        const textAttr = getFlsAttr(dir, 'text')
        const words = dir.getElementsByTagName('words')[0]
        const wordsText = words?.textContent?.trim() ?? ''
        const text = (textAttr?.trim() || wordsText).trim()
        if (!text) continue

        const pageAttr = getFlsAttr(dir, 'page')
        const nxAttr = getFlsAttr(dir, 'nx')
        const nyAttr = getFlsAttr(dir, 'ny')
        const shortcutAttr = getFlsAttr(dir, 'shortcut')
        const anchorTickAttr = getFlsAttr(dir, 'anchorTick')
        const anchorElAttr = getFlsAttr(dir, 'anchorElementId')
        const measureIdxAttr = getFlsAttr(dir, 'measureIndex0')
        const partIdxAttr = getFlsAttr(dir, 'partIndex0')
        const fracXAttr = getFlsAttr(dir, 'fracX')
        const inkDeltaYAttr = getFlsAttr(dir, 'inkDeltaY')
        const vertFracYAttr = getFlsAttr(dir, 'vertFracY')

        let page: number
        let x: number
        let y: number
        if (pageAttr !== null && nxAttr !== null && nyAttr !== null) {
          page = Math.round(Number(pageAttr))
          x = Number(nxAttr)
          y = Number(nyAttr)
          if (!Number.isFinite(page) || page < 1) page = 1
          if (!Number.isFinite(x)) x = 0.5
          if (!Number.isFinite(y)) y = 0.5
          x = Math.max(0, Math.min(1, x))
          y = Math.max(0, Math.min(1, y))
          if (totalPages > 1) page = Math.min(totalPages, Math.max(1, page))
        } else {
          const anchorFollowing = words ? getFollowingAnchorNote(dir) : null
          const fromExportInvert =
            words && anchorFollowing
              ? inferNormXYByInvertingExportWords(measure, words, anchorFollowing)
              : null
          const pos =
            fromExportInvert ??
            (words ? inferNormXYFromMusicXmlDirectionContext(dir, measure, words) : wordsElementToNormXY(undefined))
          x = pos.x
          y = pos.y
          const pagePrinted = printedPageIndexForPartMeasure(measures, mi)
          if (pageAttr !== null) {
            const p = Math.round(Number(pageAttr))
            page = Number.isFinite(p) && p >= 1 ? p : pagePrinted
          } else if (useSlicePageFallback) {
            page = slice > 0 ? Math.min(totalPages, Math.max(1, Math.floor(mi / slice) + 1)) : 1
          } else {
            page = pagePrinted
          }
          if (totalPages > 1) {
            page = Math.min(totalPages, Math.max(1, page))
          }
        }

        const color = parseAnnotationColorFromDirectionGroup(dir, words)

        const iconShortcut =
          shortcutAttr?.trim() && isInstrumentAnnotationShortcut(shortcutAttr.trim())
            ? formatAnnotationText(shortcutAttr.trim())
            : undefined

        const anchorTickParsed = anchorTickAttr !== null ? Number(anchorTickAttr) : Number.NaN
        const anchorTickStart = Number.isFinite(anchorTickParsed) ? Math.round(anchorTickParsed) : undefined
        const anchorElementId = anchorElAttr?.trim() || undefined
        const anchorMiParsed = measureIdxAttr !== null ? Number(measureIdxAttr) : Number.NaN
        const anchorMeasureListIndex0 =
          Number.isFinite(anchorMiParsed) && anchorMiParsed >= 0 ? Math.round(anchorMiParsed) : undefined
        const partIdxParsed = partIdxAttr !== null ? Number(partIdxAttr) : Number.NaN
        const anchorXmlPartIndex0 =
          Number.isFinite(partIdxParsed) && partIdxParsed >= 0 ? Math.round(partIdxParsed) : pi
        const fracXParsed = fracXAttr !== null ? Number(fracXAttr) : Number.NaN
        const anchorMeasureFracX = Number.isFinite(fracXParsed) ? fracXParsed : undefined
        const inkDeltaYParsed = inkDeltaYAttr !== null ? Number(inkDeltaYAttr) : Number.NaN
        const anchorMeasureInkDeltaY = Number.isFinite(inkDeltaYParsed) ? inkDeltaYParsed : undefined
        const vertFracYParsed = vertFracYAttr !== null ? Number(vertFracYAttr) : Number.NaN
        const anchorMeasureVertFracY = Number.isFinite(vertFracYParsed) ? vertFracYParsed : undefined

        const idOut = id.slice(FLS_ANNOTATION_DIRECTION_ID_PREFIX.length)

        out.push({
          id: idOut,
          page,
          x,
          y,
          text,
          color,
          ...(iconShortcut ? { iconShortcut } : {}),
          ...(anchorTickStart !== undefined ? { anchorTickStart } : {}),
          ...(anchorMeasureListIndex0 !== undefined ? { anchorMeasureListIndex0 } : {}),
          ...(anchorMeasureFracX !== undefined ? { anchorMeasureFracX } : {}),
          ...(anchorMeasureInkDeltaY !== undefined ? { anchorMeasureInkDeltaY } : {}),
          ...(anchorMeasureVertFracY !== undefined ? { anchorMeasureVertFracY } : {}),
          ...(anchorElementId ? { anchorElementId } : {}),
          anchorXmlPartIndex0,
        })
      }
    }
  }
  return {
    annotations: normalizeAnnotationRecords(out as unknown[]),
    verovioPageWidth,
    osmdPageWidth: null,
    renderEngine,
  }
}

/**
 * 将原始标注数据规范化，过滤非法条目；根据 `iconShortcut` 或乐器快捷 `text` 还原图标 URL。
 */
export function normalizeAnnotationRecords(items: unknown[]): ScoreAnnotationRecord[] {
  return items
    .map((item) => {
      const text = String((item as { text?: unknown })?.text ?? '')
      const legacyIcon = String((item as { icon?: unknown })?.icon ?? '')
      const storedShortcut = String((item as { iconShortcut?: unknown })?.iconShortcut ?? '').trim()
      const anchorTickRaw = Number((item as { anchorTickStart?: unknown })?.anchorTickStart)
      const anchorTickStart = Number.isFinite(anchorTickRaw) ? Math.round(anchorTickRaw) : undefined
      const anchorMiRaw = Number((item as { anchorMeasureListIndex0?: unknown })?.anchorMeasureListIndex0)
      const anchorMeasureListIndex0 =
        Number.isFinite(anchorMiRaw) && anchorMiRaw >= 0 ? Math.round(anchorMiRaw) : undefined
      const anchorPartRaw = Number((item as { anchorXmlPartIndex0?: unknown })?.anchorXmlPartIndex0)
      const anchorXmlPartIndex0 =
        Number.isFinite(anchorPartRaw) && anchorPartRaw >= 0 ? Math.round(anchorPartRaw) : undefined
      const anchorElementId = String((item as { anchorElementId?: unknown })?.anchorElementId ?? '').trim()
      const anchorFracXRaw = Number((item as { anchorMeasureFracX?: unknown })?.anchorMeasureFracX)
      const anchorMeasureFracX = Number.isFinite(anchorFracXRaw) ? anchorFracXRaw : undefined
      const anchorInkDeltaRaw = Number((item as { anchorMeasureInkDeltaY?: unknown })?.anchorMeasureInkDeltaY)
      const anchorMeasureInkDeltaY = Number.isFinite(anchorInkDeltaRaw) ? anchorInkDeltaRaw : undefined
      const anchorDomInkYRaw = Number((item as { anchorMeasureDomInkYNorm?: unknown })?.anchorMeasureDomInkYNorm)
      const anchorMeasureDomInkYNorm = Number.isFinite(anchorDomInkYRaw) ? anchorDomInkYRaw : undefined
      const anchorVertFracRaw = Number((item as { anchorMeasureVertFracY?: unknown })?.anchorMeasureVertFracY)
      const anchorMeasureVertFracY = Number.isFinite(anchorVertFracRaw) ? anchorVertFracRaw : undefined
      const shortcutForIcon =
        (storedShortcut && isInstrumentAnnotationShortcut(storedShortcut) ? storedShortcut : '') ||
        (isInstrumentAnnotationShortcut(text) ? text : '')
      const shortcutIcon = shortcutForIcon ? getInstrumentAnnotationIcon(shortcutForIcon) : ''
      const iconShortcutOut =
        storedShortcut && isInstrumentAnnotationShortcut(storedShortcut)
          ? formatAnnotationText(storedShortcut)
          : isInstrumentAnnotationShortcut(text)
            ? text
            : undefined
      return {
        id: String((item as { id?: unknown })?.id ?? ''),
        page: Number((item as { page?: unknown })?.page ?? 1),
        x: Number((item as { x?: unknown })?.x ?? 0),
        y: Number((item as { y?: unknown })?.y ?? 0),
        text,
        color: String((item as { color?: unknown })?.color ?? '#000000'),
        icon: shortcutIcon || legacyIcon,
        ...(iconShortcutOut ? { iconShortcut: iconShortcutOut } : {}),
        ...(anchorTickStart !== undefined ? { anchorTickStart } : {}),
        ...(anchorMeasureListIndex0 !== undefined ? { anchorMeasureListIndex0 } : {}),
        ...(anchorXmlPartIndex0 !== undefined ? { anchorXmlPartIndex0 } : {}),
        ...(anchorMeasureFracX !== undefined ? { anchorMeasureFracX } : {}),
        ...(anchorMeasureInkDeltaY !== undefined ? { anchorMeasureInkDeltaY } : {}),
        ...(anchorMeasureVertFracY !== undefined ? { anchorMeasureVertFracY } : {}),
        ...(anchorMeasureDomInkYNorm !== undefined ? { anchorMeasureDomInkYNorm } : {}),
        ...(anchorElementId ? { anchorElementId } : {}),
      }
    })
    .filter(
      (item) =>
        item.id &&
        Number.isFinite(item.page) &&
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        item.text.trim().length > 0,
    )
}

/**
 * 去除旧版 miscellaneous 字段、带 fls-ann- id 的 direction，得到可再次导出的「净」乐谱 XML。
 */
export function stripAnnotationArtifacts(xml: string): string {
  const { decl, doctype } = captureXmlPreamble(xml)
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    return xml
  }
  removeEmbeddedAnnotationDirections(doc)
  removeFlsMiscellaneousField(doc)
  pruneUnusedFlsNamespaceFromRoot(doc)
  const body = new XMLSerializer().serializeToString(doc.documentElement)
  return `${decl}${doctype}${body}`.trim()
}

/**
 * 从 MusicXML 恢复标注：旧 miscellaneous-field → 标准 `<direction><words>`（及旧版 `fls:*`）。
 */
export function parseScoreAnnotationsFromMusicXml(
  xml: string,
  options: { totalPages?: number } = {},
): ParsedEmbeddedAnnotations {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    return mergeEmbeddedUiFields(xml, {
      annotations: [],
      verovioPageWidth: null,
      osmdPageWidth: null,
      renderEngine: null,
    })
  }
  const fromMisc = tryParseFromMiscellaneous(doc)
  if (fromMisc && fromMisc.annotations.length) return mergeEmbeddedUiFields(xml, fromMisc)
  const totalPages = Math.max(1, options.totalPages ?? 1)
  return mergeEmbeddedUiFields(xml, tryParseFromFlsDirections(doc, totalPages))
}

export function withEmbeddedAnnotations(
  xml: string,
  data: ScoreAnnotationRecord[],
  options: {
    verovioPageWidth?: number
    /** OSMD 离屏宿主宽度（px），写入文件头注释 */
    osmdPageWidth?: number
    renderEngine?: ScoreRenderEngine
    totalPages?: number
    /** 手动页面宽度（MusicXML tenths），导出时回写到 <defaults><page-layout> */
    osmdManualPageWidthTenths?: number
    /** 手动页面高度（MusicXML tenths），导出时回写到 <defaults><page-layout> */
    osmdManualPageHeightTenths?: number
    /** OSMD 等：与 `renderMusicXmlWithOsmdPages` 同步的每页首声部小节 0-based 闭区间 */
    rendererPageMeasureBounds?: RendererPageMeasureBounds[] | null
    /** OSMD：由 `getPageMeasureHorizontalLayouts` 按 measure extent 归一化的小节水平区间 */
    rendererPageMeasureInkNormSpans?: OsmdInkNormMeasureSpan[][] | null
    /** OSMD：每页 MusicSystem 纵向范围，用于多 system 一页时按行命中小节 */
    rendererPageMusicSystemNormBounds?: OsmdMusicSystemNormBounds[][] | null
  } = {},
): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    return xml
  }

  removeEmbeddedAnnotationDirections(doc)
  removeFlsMiscellaneousField(doc)
  pruneUnusedFlsNamespaceFromRoot(doc)

  const allParts = listScorePartElements(doc)
  const firstPart = allParts[0] ?? null
  const measuresFirst = firstPart ? Array.from(firstPart.children).filter((el) => el.localName === 'measure') : []
  const totalMeasures = measuresFirst.length
  const maxPageFromData = data.length ? Math.max(...data.map((a) => a.page)) : 1
  const totalPages = Math.max(1, options.totalPages ?? maxPageFromData)
  const rendererBounds = options.rendererPageMeasureBounds ?? null
  const inkNormSpans = options.rendererPageMeasureInkNormSpans ?? null
  const systemNormBounds = options.rendererPageMusicSystemNormBounds ?? null

  if (firstPart && totalMeasures > 0 && data.length > 0) {
    /** 与点击 `resolveViewportAnnotationAnchorOnScoreXml` 共用 `pickTimedNoteForAnnotationRecord`（先锚点后视口）。 */
    if (data.length > 0) {
      ensureFlsAnnotationXmlnsOnRoot(doc)
    }
    const usedByPart = new Map<number, Set<Element>>()
    annotationDebugLog('export:withEmbeddedAnnotations', {
      annotationCount: data.length,
      totalMeasures,
      totalParts: allParts.length,
      totalPages,
      renderEngine: options.renderEngine ?? null,
      hasRendererBounds: Array.isArray(rendererBounds) && rendererBounds.length > 0,
      hasInkNormSpans: Array.isArray(inkNormSpans) && inkNormSpans.length > 0,
      firstPageBounds: rendererBounds?.[0] ?? null,
      firstPageInkSpanCount: inkNormSpans?.[0]?.length ?? 0,
    })
    data.forEach((ann, index) => {
      const partCount = Math.max(1, allParts.length)
      const partIdx = Math.min(partCount - 1, Math.max(0, Math.round(Number(ann.anchorXmlPartIndex0 ?? 0))))
      const targetPart = allParts[partIdx]!
      const measures = Array.from(targetPart.children).filter((el) => el.localName === 'measure')
      const timeline = buildPartNoteTimeline(doc, partIdx)
      const headsOrdered = orderedChordHeadsFromTimeline(timeline)
      const usedHeadNotes = usedByPart.get(partIdx) ?? new Set()
      usedByPart.set(partIdx, usedHeadNotes)

      const { picked: pickedRaw, source: pickSource } = pickTimedNoteForAnnotationRecord(
        ann,
        timeline,
        measures,
        totalPages,
        rendererBounds,
        inkNormSpans,
        systemNormBounds,
      )
      const pickedByStoredAnchor = pickSource === 'stored-anchor'

      const picked = spreadTimedNotePickForExport(headsOrdered, usedHeadNotes, pickedRaw)
      const offsetDivisions = picked
        ? picked.divisionsFromMeasureStart
        : (() => {
            const mi = mapRendererPageToFirstMeasureIndex(ann.page, totalPages, measures.length, rendererBounds)
            const m = measures[mi]
            return m ? getMeasureEndDivisions(m) : 0
          })()
      const measureForWords =
        picked?.measure ??
        measures[mapRendererPageToFirstMeasureIndex(ann.page, totalPages, measures.length, rendererBounds)] ??
        measures[0]!
      const anchorForWords = picked ? chordHeadNote(picked.note) : getFirstNoteHeadInMeasure(measureForWords)
      const { defaultX: wordsDefaultX, defaultY: wordsDefaultY } = buildWordsDefaultXYForExport(
        ann,
        anchorForWords,
        measureForWords,
      )
      const storedMi: number = (Number.isFinite(ann.anchorMeasureListIndex0) && ann.anchorMeasureListIndex0! >= 0)
        ? Math.round(ann.anchorMeasureListIndex0!)
        : -1
      const exportMeasureIndex0: number = storedMi >= 0 && storedMi < measures.length ? storedMi
        : picked ? measures.indexOf(picked.measure) : -1
      const dir = buildFlsDirectionElement(doc, ann, {
        directionOffsetDivisions: offsetDivisions,
        wordsDefaultX,
        wordsDefaultY,
        ...(exportMeasureIndex0 >= 0 ? { measureListIndex0Override: exportMeasureIndex0 } : {}),
        renderEngine: options.renderEngine ?? null,
      })
      insertFlsDirectionForAnnotation(ann, dir, timeline, { measures, totalPages, rendererPageMeasureBounds: rendererBounds }, picked)

      const exportMeasureNumberAttr =
        exportMeasureIndex0 >= 0 ? measures[exportMeasureIndex0]?.getAttribute('number') ?? null : null
      annotationDebugLog('export:row', {
        index,
        text: ann.text,
        page: ann.page,
        x: ann.x,
        y: ann.y,
        storedAnchorMeasureListIndex0: ann.anchorMeasureListIndex0,
        storedAnchorXmlPartIndex0: ann.anchorXmlPartIndex0,
        exportPartIndex0: partIdx,
        storedAnchorTickStart: ann.anchorTickStart,
        pickSource,
        pickedByStoredAnchor,
        pickedRawWasNull: !pickedRaw,
        exportMeasureIndex0: exportMeasureIndex0 >= 0 ? exportMeasureIndex0 : null,
        exportMeasureNumberAttr,
        offsetDivisions,
        wordsDefaultX,
        wordsDefaultY,
      })
    })
  }

  const { decl, doctype } = captureXmlPreamble(xml)
  const body = new XMLSerializer().serializeToString(doc.documentElement)
  let combined = `${decl}${doctype}${body}`.trim()
  const re = options.renderEngine
  const renderEngine: ScoreRenderEngine = re === 'verovio' || re === 'osmd' ? re : 'osmd'
  const osmdW =
    typeof options.osmdPageWidth === 'number' && Number.isFinite(options.osmdPageWidth)
      ? Math.round(options.osmdPageWidth)
      : 3000
  const vvW =
    typeof options.verovioPageWidth === 'number' && Number.isFinite(options.verovioPageWidth)
      ? Math.round(options.verovioPageWidth)
      : 4000

  const mwt =
    typeof options.osmdManualPageWidthTenths === 'number' &&
    Number.isFinite(options.osmdManualPageWidthTenths) &&
    options.osmdManualPageWidthTenths > 0
      ? options.osmdManualPageWidthTenths
      : undefined
  const mht =
    typeof options.osmdManualPageHeightTenths === 'number' &&
    Number.isFinite(options.osmdManualPageHeightTenths) &&
    options.osmdManualPageHeightTenths > 0
      ? options.osmdManualPageHeightTenths
      : undefined

  combined = injectFiveLineStaffUiComment(combined, {
    renderEngine,
    osmdPageWidth: osmdW,
    verovioPageWidth: vvW,
    ...(mwt !== undefined ? { osmdManualPageWidthTenths: mwt } : {}),
    ...(mht !== undefined ? { osmdManualPageHeightTenths: mht } : {}),
  })

  if (mwt !== undefined && mht !== undefined) {
    combined = patchMusicXmlPageLayoutTenths(combined, mwt, mht)
  }

  return combined
}
