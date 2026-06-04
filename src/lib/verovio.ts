import createVerovioModule from 'verovio/wasm'
import { LOG_OFF, TimemapEntry, VerovioToolkit, enableLog } from 'verovio/esm'

import { mxlToMusicXmlString } from './mxl'

export const VEROVIO_LAYOUT_CACHE_VERSION = '2026-04-23-v2'

export type VerovioHeaderFooterMode = 'auto' | 'none'

export interface PlaybackElementIndexEntry {
  id: string
  page: number
  order: number
  tstamp: number
  system: number
  measure: number
}

export interface PlaybackElementIndex {
  entries: PlaybackElementIndexEntry[]
  idToEntry: Map<string, PlaybackElementIndexEntry>
}

export interface VerovioScreenLayoutOptions {
  pageWidth?: number
  pageHeight?: number
  spacingSystem?: number
  spacingStaff?: number
  pageMarginTop?: number
  pageMarginBottom?: number
  pageMarginLeft?: number
  pageMarginRight?: number
  header?: VerovioHeaderFooterMode
  footer?: VerovioHeaderFooterMode
  /** 谱面主色（深色主题建议白色，浅色主题建议黑色） */
  inkColor?: string
}

let wasmPromise: ReturnType<typeof createVerovioModule> | null = null

function getWasmModule() {
  if (!wasmPromise) {
    wasmPromise = createVerovioModule()
  }
  return wasmPromise
}

/**
 * 创建 VerovioToolkit（WASM 单例模块，可多次创建 toolkit）。
 * 用于解析 MusicXML、MEI、MXL 解压后的字符串并渲染为 SVG。
 */
export async function createVerovioToolkit(): Promise<VerovioToolkit> {
  const wasm = await getWasmModule()
  // enableLog 第二个参数必须是已初始化的 Emscripten Module（见 verovio/esm）
  enableLog(LOG_OFF, wasm)
  return new VerovioToolkit(wasm)
}

/**
 * 将 MusicXML 或 MEI（均为 Verovio `loadData` 可识别的 XML 文本）载入 toolkit，返回是否成功。
 */
export function loadMusicXml(toolkit: VerovioToolkit, musicXml: string): boolean {
  return toolkit.loadData(normalizeMusicXmlForTargetScore(musicXml)) !== 0
}

/**
 * 从 .mxl（ZIP）解析出 MusicXML 文本，再交给 Verovio。
 */
export async function loadMxlBuffer(
  toolkit: VerovioToolkit,
  buffer: ArrayBuffer,
): Promise<boolean> {
  const xml = await mxlToMusicXmlString(buffer)
  return loadMusicXml(toolkit, xml)
}

/** 将已 loadData 的乐谱逐页渲染为 SVG 字符串（页码从 1 开始） */
export function renderAllPagesSvg(toolkit: VerovioToolkit): string[] {
  const count = toolkit.getPageCount()
  const pages: string[] = []
  for (let p = 1; p <= count; p++) {
    pages.push(toolkit.renderToSVG(p))
  }
  return pages
}

/** 渲染当前乐谱为 MIDI（Base64 字符串，可能带 data: 前缀）。 */
export async function renderMusicXmlToMidiBase64(musicXml: string): Promise<string> {
  const toolkit = await createVerovioToolkit()
  const ok = loadMusicXml(toolkit, musicXml)
  if (!ok) {
    throw new Error('Verovio 无法生成 MIDI：乐谱解析失败')
  }
  const midiRenderer = toolkit as VerovioToolkit & { renderToMIDI?: () => string }
  const midi = midiRenderer.renderToMIDI?.().trim() ?? ''
  if (!midi) {
    throw new Error('Verovio 未输出有效 MIDI 数据')
  }
  return midi
}

/**
 * 为屏幕阅读设置常用排版选项（可按需调整 JSON）。
 * @see https://book.verovio.org/toolkit-reference/outputs.html
 * 1800 - 1 ～3 小节
 * 2400 - 3 小节
 * 3600 - 8 小节
 */
function estimatePageHeightByScoreSize(pageWidth: number): number {
  const baseHeight = Math.round(pageWidth * 1.15)
  const clampedWidth = Math.max(600, Math.min(3200, pageWidth))
  const sizeBonus = Math.round((clampedWidth - 600) * 0.7)
  return Math.max(1200, baseHeight + sizeBonus + 180)
}

function normalizeMusicXmlForTargetScore(musicXml: string): string {
  const targetTitle = 'Frühlingsstimmen'
  if (!musicXml.includes(targetTitle)) return musicXml

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(musicXml, 'application/xml')
    if (doc.querySelector('parsererror')) return musicXml

    const scoreParts = Array.from(doc.getElementsByTagName('score-part'))
    const parts = Array.from(doc.getElementsByTagName('part'))
    if (scoreParts.length === 0 || parts.length === 0) return musicXml

    for (const part of parts) {
      const measures = Array.from(part.getElementsByTagName('measure'))
      for (const measure of measures) {
        if (!isClearlyWholeMeasureRest(measure)) continue
        ensureWholeMeasureRestMarkup(measure)
      }
    }

    return new XMLSerializer().serializeToString(doc)
  } catch {
    return musicXml
  }
}

function isClearlyWholeMeasureRest(measure: Element): boolean {
  const notes = Array.from(measure.getElementsByTagName('note'))
  if (notes.length === 0) return false
  const sounding = notes.filter((note) => note.getElementsByTagName('rest').length === 0)
  if (sounding.length > 0) return false
  const durations = notes
    .map((note) => Number(note.getElementsByTagName('duration')[0]?.textContent ?? '0'))
    .filter((n) => Number.isFinite(n) && n > 0)
  const maxDuration = Math.max(...durations, 0)
  return maxDuration > 0
}

function ensureWholeMeasureRestMarkup(measure: Element): void {
  const note = Array.from(measure.getElementsByTagName('note'))[0]
  if (!note) return
  const rest = note.getElementsByTagName('rest')[0]
  if (rest) {
    rest.setAttribute('measure', 'yes')
  }
}

export function applyScreenLayoutOptions(
  toolkit: VerovioToolkit,
  options: VerovioScreenLayoutOptions = {},
): void {
  const pageWidth = Number.isFinite(options.pageWidth) ? Math.max(600, Math.round(options.pageWidth as number)) : 4000
  const estimatedPageHeight = Number.isFinite(options.pageHeight)
    ? Math.max(1200, Math.round(options.pageHeight as number))
    : estimatePageHeightByScoreSize(pageWidth)
  const header = options.header ?? 'auto'
  const footer = options.footer ?? 'none'
  const inkColor = (options.inkColor ?? '#ffffff').trim() || '#ffffff'
  const ok = toolkit.setOptions({
    pageWidth,
    pageHeight: estimatedPageHeight,
    adjustPageWidth: false,
    adjustPageHeight: false,
    spacingSystem: Number.isFinite(options.spacingSystem) ? Math.max(0, Number(options.spacingSystem)) : 28,
    spacingStaff: Number.isFinite(options.spacingStaff) ? Math.max(0, Number(options.spacingStaff)) : 12,
    pageMarginTop: Number.isFinite(options.pageMarginTop) ? Math.max(0, Number(options.pageMarginTop)) : 25,
    pageMarginBottom: Number.isFinite(options.pageMarginBottom) ? Math.max(0, Number(options.pageMarginBottom)) : 25,
    pageMarginLeft: Number.isFinite(options.pageMarginLeft) ? Math.max(0, Number(options.pageMarginLeft)) : 20,
    pageMarginRight: Number.isFinite(options.pageMarginRight) ? Math.max(0, Number(options.pageMarginRight)) : 20,
    scale: 20,
    expand: true, // 展开乐谱
    footer,
    header, // 保留标题等页眉信息
    // Verovio 官方支持 svgCss：将谱面图元统一为当前主题色。
    svgCss: `
      g.page-margin,
      g.page-margin text,
      g.score,
      g.note,
      g.rest,
      g.clef,
      g.keySig,
      g.meterSig,
      g.line,
      g.staff,
      g.staffDef,
      g.ledgerline,
      g.stem,
      g.beam,
      g.hairpin,
      g.dynam,
      g.dir,
      g.lyric,
      g.syl,
      g.verse {
        fill: ${inkColor};
        color: ${inkColor};
        stroke: ${inkColor};
      }
    `,
    suppressEmptyStaves: 'false',
  })
  if (!ok) {
    throw new Error('Verovio setOptions 失败：屏幕排版参数未生效')
  }
}

/**
 * 从已加载乐谱的 Verovio toolkit 提取每页的归一化播放进度边界。
 *
 * 利用 `renderToTimemap()` 返回的时间映射表，按 `pageOn` 分组，
 * 取每页内最大的 `tstamp` 作为该页结束时的累计进度。
 * 再用总最大 `tstamp` 归一化得到 [0, 1] 之间的边界数组。
 *
 * @param toolkit - 已 loadData 的 VerovioToolkit 实例
 * @returns 长度 = totalPages 的归一化边界数组，每项表示该页结束时已播放的进度比例
 */
export function extractPageBoundaryProgress(toolkit: VerovioToolkit): number[] {
  const totalPages = toolkit.getPageCount()
  if (totalPages <= 1) return [1]

  const timemap: TimemapEntry[] = toolkit.renderToTimemap()
  if (!Array.isArray(timemap) || timemap.length === 0) return []

  // 按 pageOn 分组，记录每页的最大 tstamp
  const maxTsPerPage = new Map<number, number>()
  let overallMaxTs = 0
  for (const entry of timemap) {
    const page = entry.pageOn
    const ts = entry.tstamp
    const current = maxTsPerPage.get(page) ?? 0
    if (ts > current) {
      maxTsPerPage.set(page, ts)
    }
    if (ts > overallMaxTs) {
      overallMaxTs = ts
    }
  }

  if (overallMaxTs <= 0) return []

  const linearFallback = (): number[] =>
    Array.from({ length: totalPages }, (_, i) => (i + 1) / totalPages)

  // Sibelius 等导出的 timemap 常无 pageOn：按 undefined/NaN 聚合会得到全 0 边界，上层会丢弃，
  // 语义表却仍用 SVG id→页 推断，易与 MIDI 不同步。无有效页键时退回「按页均分进度」。
  const hasNumericPageKey = [...maxTsPerPage.keys()].some(
    (k) => typeof k === 'number' && Number.isFinite(k) && k >= 1 && k <= totalPages,
  )
  if (!hasNumericPageKey) {
    return linearFallback()
  }

  // 构建每页边界（页码从 1 开始）
  const boundaries: number[] = []
  for (let page = 1; page <= totalPages; page += 1) {
    const maxTs = maxTsPerPage.get(page) ?? 0
    boundaries.push(maxTs / overallMaxTs)
  }

  // 最后一页边界固定为 1；其余异常交给上层校验后回退。
  boundaries[boundaries.length - 1] = 1

  let prev = 0
  for (let i = 0; i < boundaries.length; i += 1) {
    const b = boundaries[i] ?? 0
    if (i > 0 && b <= prev + 1e-9) return linearFallback()
    prev = b
  }

  return boundaries
}

/**
 * 从 Verovio `renderToTimemap()` 提取每页内各 system 的归一化结束边界（全局 [0,1]，不做页内归一化）。
 *
 * 返回值结构：
 *   - 外层数组：按 page（从 1 开始）排列
 *   - 内层数组：按 systemOn（升序）排列，每项为该 system 内最大 tstamp
 *
 * 若 timemap 不包含 system 划分信息，则返回空数组或对应页为空数组，由上层决定回退策略。
 */
export function extractSystemBoundaryProgressByPage(toolkit: VerovioToolkit): number[][] {
  const totalPages = toolkit.getPageCount()
  if (totalPages <= 0) return []

  const timemap: TimemapEntry[] = toolkit.renderToTimemap()
  if (!Array.isArray(timemap) || timemap.length === 0) return []

  const maxTsPerPageSystem = new Map<string, number>()
  const systemOnPerPage = new Map<number, Set<number>>()

  for (const entry of timemap) {
    const page = entry.pageOn
    const systemOn = entry.systemOn
    if (!Number.isFinite(page) || !Number.isFinite(systemOn as number)) continue

    const sys = systemOn as number
    if (sys <= 0) continue

    const key = `${page}:${sys}`
    const cur = maxTsPerPageSystem.get(key) ?? 0
    if (entry.tstamp > cur) {
      maxTsPerPageSystem.set(key, entry.tstamp)
    }

    const set = systemOnPerPage.get(page) ?? new Set<number>()
    set.add(sys)
    systemOnPerPage.set(page, set)
  }

  if (systemOnPerPage.size === 0) return []

  const out: number[][] = []
  for (let page = 1; page <= totalPages; page += 1) {
    const set = systemOnPerPage.get(page)
    if (!set || set.size === 0) {
      out.push([])
      continue
    }
    const ordered = Array.from(set).sort((a, b) => a - b)
    const boundaries = ordered.map((sysOn) => maxTsPerPageSystem.get(`${page}:${sysOn}`) ?? 0)
    out.push(boundaries)
  }

  return out
}

function isPlaybackCandidateElementId(id: string): boolean {
  const trimmed = id.trim().replace(/^#/, '')
  if (!trimmed) return false
  return /[A-Za-z]/.test(trimmed) && !/^page-/.test(trimmed)
}

/**
 * 从 SVG 中提取 note/rest 相关元素的稳定播放索引。
 * 结果按 DOM 顺序排序，便于播放时通过索引回查 DOM。
 */
export function buildPlaybackElementIndexFromSvg(pagesSvg: string[]): PlaybackElementIndex {
  if (!Array.isArray(pagesSvg) || pagesSvg.length === 0) return { entries: [], idToEntry: new Map() }
  const entries: PlaybackElementIndexEntry[] = []
  const idToEntry = new Map<string, PlaybackElementIndexEntry>()
  const idRegex = /\sid="([^"]+)"/g
  pagesSvg.forEach((svg, pageIdx) => {
    idRegex.lastIndex = 0
    let order = 0
    let m: RegExpExecArray | null
    while ((m = idRegex.exec(svg)) !== null) {
      const id = (m[1] ?? '').trim().replace(/^#/, '')
      if (!isPlaybackCandidateElementId(id)) continue
      const lower = id.toLowerCase()
      if (!lower.includes('note') && !lower.includes('rest')) continue
      order += 1
      const entry: PlaybackElementIndexEntry = {
        id,
        page: pageIdx + 1,
        order,
        tstamp: order,
        system: 1,
        measure: 0,
      }
      entries.push(entry)
      if (!idToEntry.has(id)) idToEntry.set(id, entry)
    }
  })
  return { entries, idToEntry }
}

/**
 * 创建用于播放高亮的专用 Verovio toolkit。
 *
 * 与普通 SVG 渲染不同，此函数还会调用 `renderToMIDI()` 启用内部时间映射结构，
 * 使 `getElementsAtTime()` 等 API 可用。返回的 toolkit 需要在整个播放生命周期内保持存活。
 *
 * @param sourceXml - MusicXML / MEI 文本
 * @param options - 排版参数（须与 SVG 渲染参数一致以确保元素 ID 匹配）
 * @returns toolkit（需保持存活用于 getElementsAtTime）+ midiBase64（用于 FluidSynth 播放）
 */
export async function createPlaybackToolkit(
  sourceXml: string,
  options: VerovioScreenLayoutOptions = {},
): Promise<{ toolkit: VerovioToolkit; midiBase64: string }> {
  const toolkit = await createVerovioToolkit()
  applyScreenLayoutOptions(toolkit, options)
  const ok = loadMusicXml(toolkit, sourceXml)
  if (!ok) {
    throw new Error('Verovio 无法解析该乐谱数据（播放用 toolkit）')
  }
  const midi = toolkit.renderToMIDI()
  if (!midi) {
    throw new Error('Verovio 未输出有效 MIDI 数据（播放用 toolkit）')
  }
  return { toolkit, midiBase64: midi }
}
