import type { OsmdInkNormMeasureSpan, OsmdMusicSystemNormBounds } from '@/lib/musicXmlNoteAnchors'

export type ScoreViewMode = 'page' | 'scroll'

export interface ScoreAnnotationRecord {
  id: string
  page: number
  x: number
  y: number
  text: string
  color: string
  icon?: string
  /** 乐器快捷键（如 V1、FL），导出到 MusicXML 后供本应用还原 SVG 图标 */
  iconShortcut?: string
  /** 点击时命中的 Verovio SVG / 内部 xml:id，用于调试或二次解析 */
  anchorElementId?: string
  /**
   * 与 `currentMidiTotalTicks` 同一尺度的 MIDI tick，由 Verovio `getTimeForElement` 映射得到；
   * 导出时用于把 `<direction>` 插到时间最近的 `<note>` 之后。
   */
  anchorTickStart?: number
  /**
   * OSMD：点击时解析得到的首声部 `<measure>` 0-based 下标（与引擎 `measureListIndex`、导出插入一致）。
   * 导出时优先用其锁定 `<direction>` 所在小节，避免仅靠 tick/x 二次推断错位。
   */
  anchorMeasureListIndex0?: number
  /**
   * MusicXML 中 `<part>` 在 `score-partwise` 下的 0-based 顺序下标（与 Sibelius P1/P2/… 文档顺序一致）。
   * 总谱多 part 时用于把 `<direction>` 写入用户点击的乐器分谱，而非一律首 part。
   */
  anchorXmlPartIndex0?: number
  /**
   * OSMD：相对 `anchorMeasureListIndex0` 对应小节墨迹 span 的横向比例 [0,1]。
   * 屏上位置由此 + 当前 ink span 投影得到，而非单独依赖容器 x/y。
   */
  anchorMeasureFracX?: number
  /** OSMD：墨迹 ny 相对锚定 span.top 的偏移（可为负，表示谱表上方）。归一化值，依赖页面 vRange，排版变化后会漂移。 */
  anchorMeasureInkDeltaY?: number
  /**
   * OSMD：纵向位置占锚定小节 span 高度的比例（可为负/大于1，表示高出或低于谱表范围）。
   * 排版无关量：(inkY - spanTop) / (spanBottom - spanTop)，不受页面 vRange 变化影响。
   * 重排版后优先使用此值恢复纵向位置。
   */
  anchorMeasureVertFracY?: number
  /** OSMD：相对页内 DOM 墨迹区顶边的纵轴比例（与 overlay 视觉一致）。 */
  anchorMeasureDomInkYNorm?: number
  /** @internal 调试字段：点击所在页的小节区间 "start,end,inkSpanCount"，导出时写入 fls:dbgBounds */
  _dbgBounds?: string
}

export interface ScoreCacheRecord {
  cacheKey: string
  fileName: string
  pagesSvg: string[]
  totalPages: number
  viewMode: ScoreViewMode
  currentPage: number
  annotations?: ScoreAnnotationRecord[]
  /**
   * 与打开文件时一致的 MusicXML 文本（已去掉本应用标注：direction / miscellaneous / 旧注释），用于从缓存恢复后仍可「导出带标注」。
   * 旧缓存无此字段时需用户重新打开一次原文件以写入。
   */
  musicXmlForExport?: string
  /**
   * 每页结束时的归一化播放进度值 [0, 1]，长度等于 totalPages。
   * 由 Verovio `renderToTimemap()` 提取，用于播放光标精确定位。
   * 旧缓存无此字段时播放光标回退到线性页面映射。
   */
  pageBoundaryProgress?: number[]
  /**
   * 每页内各 system 的归一化播放进度边界（已按页内归一化到 [0, 1]）。
   * 外层数组长度 = totalPages，内层为每页 system 结束边界，严格递增且末项恒为 1。
   * 用于播放指示线在页内 system 间正确换行跳转。
   * 旧缓存无此字段时播放光标按 system 数量均分或从 timemap 重新提取。
   */
  systemBoundaryProgressByPage?: number[][]
  /**
   * MusicXML 语义播放表（按 tick 区间映射到 progress/page/system）。
   * 用于播放阶段直接查表，避免运行时临时解析导致的定位不稳定。
   * tickStart / tickEnd：当前这一行对应的 MIDI tick 区间（左闭右开语义在查表时用 tickEnd 分界）。totalTicks 来自 renderToMIDI() 后算出的整首总 tick（rebuildSemanticPlaybackRows 里）。行内 tick 与 Verovio timemap 的 tstamp 按总 tick 缩放对齐；若走「按小节」回退路径，则 tick 来自 MusicXML 里各小节的 divisions 累加（note / backup / forward）。
   * progressStart / progressEnd ：整首进度上的区间，归一化到 [0, 1]。通常对应 timemap 里该段的起止 tstamp（相对 maxTstamp 归一化），或按小节聚合时的 minTs / maxTs。播放光标在 [tickStart, tickEnd) 内会按 tick 在该区间内 线性插值 得到 progress。
   * page：PDF/谱面页码（从 1 开始）。优先用 timemap 的 pageOn；没有有效 pageOn 时可能用 SVG 元素 id → 页映射，或按 pageBoundaryProgress 从 progress 反推页。
   * system：该段落在该页上的 第几行谱表（system）（从 1 开始）。来自 timemap 的 systemOn，或按该页的 systemBoundaryProgress 从 progress 推算。
   * 
   */
  semanticPlaybackRows?: Array<{
    tickStart: number
    tickEnd: number
    progressStart: number
    progressEnd: number
    page: number
    system: number
  }>
  /**
   * Verovio `renderToMIDI()` 输出的 base64，与 `layoutVersion` / 源 MusicXML 绑定。
   * 用于跳过重复生成 MIDI，缩短「准备乐器音色库」耗时。
   */
  midiBase64?: string
  /** 整首 MIDI 总 tick 数，与 `midiBase64` 配套 */
  midiTotalTicks?: number
  /** 由 tempo map 换算的整首时长（毫秒），可选；缺失时播放准备阶段会重算 */
  midiTotalMs?: number
  /** MIDI 速度映射（PPQ + tempo 事件），可选；缺失时可从 `midiBase64` 再解析 */
  midiTempoMap?: ScoreCacheMidiTempoMap
  /**
   * OSMD 下与 `pagesSvg` 等长：每页在首声部 `<measure>` 列表中的 0-based 闭区间（与 OSMD 分页图元一致）。
   * 用于标注锚点映射；Verovio 或未写入时缺省。
   */
  osmdPageMeasureIndexBounds?: Array<{ start: number; end: number }>
  /**
   * OSMD：每页上各小节在墨迹宽度上的归一化水平区间（与 `ann.x` 参照一致），长度须与 `pagesSvg` 一致。
   */
  osmdPageMeasureInkNormSpans?: OsmdInkNormMeasureSpan[][]
  /** OSMD：每页 MusicSystem 墨迹归一化纵向范围（播放指示线 system 高度） */
  osmdPageMusicSystemNormBounds?: OsmdMusicSystemNormBounds[][]
  layoutVersion: string
  /**
   * 打开时原始 MusicXML 是否含有 `five-line-staff-ui` 文件头注释（通常为导出后再打开）。
   * 用于提醒「应用排版」可能使标注错位；从缓存恢复时依赖此字段。
   */
  hadFlsUiCommentOnOpen?: boolean
  createdAt: number
  lastAccessAt: number
}

export interface ScoreCacheSummary {
  cacheKey: string
  fileName: string
  totalPages: number
  lastAccessAt: number
}

export interface ScoreCacheMidiTempoMap {
  ppq: number
  events: Array<{ tick: number; microSecondsPerQN: number }>
}

export type ScoreCacheMidiFields = Pick<
  ScoreCacheRecord,
  'midiBase64' | 'midiTotalTicks' | 'midiTotalMs' | 'midiTempoMap'
>

/** 校验通过、可写入或恢复的 MIDI 快照（必填字段已齐全）。 */
export interface ScoreCacheMidiSnapshot {
  midiBase64: string
  midiTotalTicks: number
  midiTotalMs?: number
  midiTempoMap?: ScoreCacheMidiTempoMap
}

/** 规范化待写入 IndexedDB 的 MIDI 字段；数据不完整时返回 undefined（不写入/不覆盖）。 */
export function normalizeScoreCacheMidiFields(
  fields: Partial<ScoreCacheMidiFields>,
): ScoreCacheMidiSnapshot | undefined {
  const midiBase64 = String(fields.midiBase64 ?? '').trim()
  if (!midiBase64) return undefined

  const midiTotalTicks = Math.max(0, Math.floor(Number(fields.midiTotalTicks) || 0))
  if (midiTotalTicks <= 0) return undefined

  const rawTempo = fields.midiTempoMap
  let midiTempoMap: ScoreCacheMidiTempoMap | undefined
  if (rawTempo && Number.isFinite(Number(rawTempo.ppq))) {
    const ppq = Math.max(1, Math.round(Number(rawTempo.ppq)))
    const events = Array.isArray(rawTempo.events)
      ? rawTempo.events
          .map((ev) => ({
            tick: Math.max(0, Math.round(Number(ev.tick) || 0)),
            microSecondsPerQN: Math.max(1, Math.round(Number(ev.microSecondsPerQN) || 0)),
          }))
          .filter((ev) => Number.isFinite(ev.tick) && Number.isFinite(ev.microSecondsPerQN))
          .sort((a, b) => a.tick - b.tick)
      : []
    if (events.length > 0) {
      midiTempoMap = { ppq, events }
    }
  }

  const midiTotalMs = Math.max(0, Math.floor(Number(fields.midiTotalMs) || 0))
  return {
    midiBase64,
    midiTotalTicks,
    ...(midiTotalMs > 0 ? { midiTotalMs } : {}),
    ...(midiTempoMap ? { midiTempoMap } : {}),
  }
}

/** 从乐谱缓存记录读取可恢复的 MIDI 快照；字段无效时返回 null。 */
export function getScoreCacheMidiSnapshot(cached: ScoreCacheRecord): ScoreCacheMidiSnapshot | null {
  return normalizeScoreCacheMidiFields({
    midiBase64: cached.midiBase64,
    midiTotalTicks: cached.midiTotalTicks,
    midiTotalMs: cached.midiTotalMs,
    midiTempoMap: cached.midiTempoMap,
  }) ?? null
}

const DB_NAME = 'five-line-staff-cache'
const DB_VERSION = 1
const SCORES_STORE = 'scores'
const STATE_STORE = 'state'
const LAST_OPENED_KEY = 'lastOpenedCacheKey'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SCORES_STORE)) {
        db.createObjectStore(SCORES_STORE, { keyPath: 'cacheKey' })
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const request = action(store)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 基于文件二进制内容计算 SHA-256，用于唯一标识同一文件。 */
export async function getFileSha256Hex(file: File): Promise<string> {
  // 极端环境若不支持 SubtleCrypto，降级到弱指纹避免功能中断。
  if (!globalThis.crypto?.subtle) {
    return `fallback:${file.name}:${file.size}:${file.lastModified}`
  }
  const data = await file.arrayBuffer()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

export function buildScoreCacheKey(
  fileHash: string,
  layoutVersion: string,
  engine: 'verovio' | 'osmd',
): string {
  return `${engine}:${layoutVersion}:${fileHash}`
}

/** 将缓存中的 OSMD 墨迹 span 规范为可克隆结构，保留 top/bottom（多 system 纵向定位必需）。 */
export function normalizeOsmdPageMeasureInkNormSpans(
  spans: OsmdInkNormMeasureSpan[][] | undefined,
  expectedPageCount: number,
): OsmdInkNormMeasureSpan[][] | undefined {
  if (!Array.isArray(spans) || spans.length !== expectedPageCount) return undefined
  const out: OsmdInkNormMeasureSpan[][] = []
  for (const pageSpans of spans) {
    if (!Array.isArray(pageSpans)) return undefined
    const pageOut: OsmdInkNormMeasureSpan[] = []
    for (const s of pageSpans) {
      const mi = Number(s.measureListIndex)
      const left = Number(s.left)
      const right = Number(s.right)
      if (!Number.isFinite(mi) || !Number.isFinite(left) || !Number.isFinite(right) || right < left) {
        return undefined
      }
      const topRaw = Number((s as { top?: unknown }).top)
      const bottomRaw = Number((s as { bottom?: unknown }).bottom)
      const hasY =
        Number.isFinite(topRaw) &&
        Number.isFinite(bottomRaw) &&
        bottomRaw > topRaw + 1e-6
      const pi = Number((s as { partIndex0?: unknown }).partIndex0)
      pageOut.push({
        measureListIndex: Math.round(mi),
        left,
        right,
        ...(hasY ? { top: topRaw, bottom: bottomRaw } : {}),
        ...(Number.isFinite(pi) && pi >= 0 ? { partIndex0: Math.round(pi) } : {}),
      })
    }
    out.push(pageOut)
  }
  return out
}

export async function getScoreCache(cacheKey: string): Promise<ScoreCacheRecord | null> {
  const cached = await withStore<ScoreCacheRecord | undefined>(SCORES_STORE, 'readonly', (store) =>
    store.get(cacheKey),
  )
  if (!cached) return null

  const touched: ScoreCacheRecord = {
    ...cached,
    lastAccessAt: Date.now(),
  }
  await withStore<IDBValidKey>(SCORES_STORE, 'readwrite', (store) => store.put(touched))
  return touched
}

export async function putScoreCache(
  input: Omit<ScoreCacheRecord, 'createdAt' | 'lastAccessAt'>,
): Promise<void> {
  const now = Date.now()
  const existing = await withStore<ScoreCacheRecord | undefined>(SCORES_STORE, 'readonly', (store) =>
    store.get(input.cacheKey),
  )

  // IndexedDB 无法持久化 Vue 的 Proxy；写入前转成可结构化克隆的纯对象。
  const plainPagesSvg = Array.isArray(input.pagesSvg) ? [...input.pagesSvg] : []
  const plainAnnotations = Array.isArray(input.annotations)
    ? input.annotations.map((item) => ({
        id: String(item.id),
        page: Number(item.page),
        x: Number(item.x),
        y: Number(item.y),
        text: String(item.text),
        color: String(item.color),
        ...(typeof item.icon === 'string' && item.icon ? { icon: item.icon } : {}),
        ...(item.iconShortcut ? { iconShortcut: String(item.iconShortcut) } : {}),
        ...(Number.isFinite(item.anchorTickStart) ? { anchorTickStart: Math.round(item.anchorTickStart as number) } : {}),
        ...(Number.isFinite(item.anchorMeasureListIndex0)
          ? { anchorMeasureListIndex0: Math.round(item.anchorMeasureListIndex0 as number) }
          : {}),
        ...(Number.isFinite(item.anchorXmlPartIndex0) && (item.anchorXmlPartIndex0 as number) >= 0
          ? { anchorXmlPartIndex0: Math.round(item.anchorXmlPartIndex0 as number) }
          : {}),
        ...(Number.isFinite(item.anchorMeasureFracX)
          ? { anchorMeasureFracX: Number(item.anchorMeasureFracX) }
          : {}),
        ...(Number.isFinite(item.anchorMeasureInkDeltaY)
          ? { anchorMeasureInkDeltaY: Number(item.anchorMeasureInkDeltaY) }
          : {}),
        ...(Number.isFinite(item.anchorMeasureDomInkYNorm)
          ? { anchorMeasureDomInkYNorm: Number(item.anchorMeasureDomInkYNorm) }
          : {}),
        ...(item.anchorElementId ? { anchorElementId: String(item.anchorElementId) } : {}),
      }))
    : undefined

  const normalizedBounds =
    Array.isArray(input.osmdPageMeasureIndexBounds) &&
    input.osmdPageMeasureIndexBounds.length === plainPagesSvg.length
      ? input.osmdPageMeasureIndexBounds.map((b) => ({
          start: Math.round(Number(b.start)),
          end: Math.round(Number(b.end)),
        }))
      : existing?.osmdPageMeasureIndexBounds &&
          existing.osmdPageMeasureIndexBounds.length === plainPagesSvg.length
        ? existing.osmdPageMeasureIndexBounds.map((b) => ({
            start: Math.round(Number(b.start)),
            end: Math.round(Number(b.end)),
          }))
        : undefined

  const normalizedInkSpans =
    normalizeOsmdPageMeasureInkNormSpans(input.osmdPageMeasureInkNormSpans, plainPagesSvg.length) ??
    (existing?.osmdPageMeasureInkNormSpans &&
    existing.osmdPageMeasureInkNormSpans.length === plainPagesSvg.length
      ? normalizeOsmdPageMeasureInkNormSpans(existing.osmdPageMeasureInkNormSpans, plainPagesSvg.length)
      : undefined)

  const normalizeSystemBounds = (
    rows: OsmdMusicSystemNormBounds[][] | undefined,
  ): OsmdMusicSystemNormBounds[][] | undefined => {
    if (!Array.isArray(rows) || rows.length !== plainPagesSvg.length) return undefined
    const out: OsmdMusicSystemNormBounds[][] = []
    for (const pageRows of rows) {
      if (!Array.isArray(pageRows)) return undefined
      out.push(
        pageRows
          .map((b) => {
            const top = Number(b.top)
            const bottom = Number(b.bottom)
            if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top + 1e-6) return null
            return { top, bottom }
          })
          .filter((b): b is OsmdMusicSystemNormBounds => b != null),
      )
    }
    return out
  }

  const normalizedSystemBounds =
    normalizeSystemBounds(input.osmdPageMusicSystemNormBounds) ??
    (existing?.osmdPageMusicSystemNormBounds &&
    existing.osmdPageMusicSystemNormBounds.length === plainPagesSvg.length
      ? normalizeSystemBounds(existing.osmdPageMusicSystemNormBounds)
      : undefined)

  const mergedMusicXmlForExport =
    input.musicXmlForExport !== undefined && String(input.musicXmlForExport).length > 0
      ? String(input.musicXmlForExport)
      : existing?.musicXmlForExport

  const mergedHadFlsUiCommentOnOpen =
    typeof input.hadFlsUiCommentOnOpen === 'boolean'
      ? input.hadFlsUiCommentOnOpen
      : existing?.hadFlsUiCommentOnOpen

  const inputMidi = normalizeScoreCacheMidiFields(input)
  const existingMidi = existing ? normalizeScoreCacheMidiFields(existing) : undefined
  const mergedMidi = inputMidi ?? existingMidi

  const record: ScoreCacheRecord = {
    cacheKey: String(input.cacheKey),
    fileName: String(input.fileName),
    pagesSvg: plainPagesSvg,
    totalPages: Number(input.totalPages),
    viewMode: input.viewMode,
    currentPage: Number(input.currentPage),
    annotations: plainAnnotations,
    ...(mergedMusicXmlForExport ? { musicXmlForExport: mergedMusicXmlForExport } : {}),
    ...(Array.isArray(input.pageBoundaryProgress)
      ? { pageBoundaryProgress: [...input.pageBoundaryProgress] }
      : {}),
    ...(Array.isArray(input.systemBoundaryProgressByPage)
      ? {
          systemBoundaryProgressByPage: input.systemBoundaryProgressByPage.map((arr) =>
            Array.isArray(arr) ? [...arr] : [],
          ),
        }
      : {}),
    ...(Array.isArray(input.semanticPlaybackRows)
      ? {
          semanticPlaybackRows: input.semanticPlaybackRows.map((row) => ({
            tickStart: Number(row.tickStart),
            tickEnd: Number(row.tickEnd),
            progressStart: Number(row.progressStart),
            progressEnd: Number(row.progressEnd),
            page: Number(row.page),
            system: Number(row.system),
          })),
        }
      : {}),
    ...(mergedMidi ?? {}),
    ...(normalizedBounds ? { osmdPageMeasureIndexBounds: normalizedBounds } : {}),
    ...(normalizedInkSpans ? { osmdPageMeasureInkNormSpans: normalizedInkSpans } : {}),
    ...(normalizedSystemBounds ? { osmdPageMusicSystemNormBounds: normalizedSystemBounds } : {}),
    layoutVersion: String(input.layoutVersion),
    ...(typeof mergedHadFlsUiCommentOnOpen === 'boolean'
      ? { hadFlsUiCommentOnOpen: mergedHadFlsUiCommentOnOpen }
      : {}),
    createdAt: existing?.createdAt ?? now,
    lastAccessAt: now,
  }
  await withStore<IDBValidKey>(SCORES_STORE, 'readwrite', (store) => store.put(record))
}

export async function pruneScoreCache(maxEntries = 3): Promise<void> {
  const all = await withStore<ScoreCacheRecord[]>(SCORES_STORE, 'readonly', (store) => store.getAll())
  if (all.length <= maxEntries) return

  const sorted = [...all].sort((a, b) => b.lastAccessAt - a.lastAccessAt)
  const toDelete = sorted.slice(maxEntries)
  await Promise.all(
    toDelete.map((item) =>
      withStore<undefined>(SCORES_STORE, 'readwrite', (store) => store.delete(item.cacheKey)),
    ),
  )
}

export async function setLastOpenedCacheKey(cacheKey: string): Promise<void> {
  await withStore<IDBValidKey>(STATE_STORE, 'readwrite', (store) =>
    store.put(cacheKey, LAST_OPENED_KEY),
  )
}

export async function getLastOpenedCacheKey(): Promise<string | null> {
  const key = await withStore<string | undefined>(STATE_STORE, 'readonly', (store) =>
    store.get(LAST_OPENED_KEY),
  )
  return key ?? null
}

export async function removeScoreCache(cacheKey: string): Promise<void> {
  if (!cacheKey) return
  await withStore<undefined>(SCORES_STORE, 'readwrite', (store) => store.delete(cacheKey))
}

export async function clearLastOpenedCacheKey(): Promise<void> {
  await withStore<undefined>(STATE_STORE, 'readwrite', (store) => store.delete(LAST_OPENED_KEY))
}

export async function clearAllScoreCache(): Promise<void> {
  await Promise.all([
    withStore<undefined>(SCORES_STORE, 'readwrite', (store) => store.clear()),
    withStore<undefined>(STATE_STORE, 'readwrite', (store) => store.clear()),
  ])
}

export async function listScoreCacheSummaries(): Promise<ScoreCacheSummary[]> {
  const all = await withStore<ScoreCacheRecord[]>(SCORES_STORE, 'readonly', (store) => store.getAll())
  return all
    .map((item) => ({
      cacheKey: item.cacheKey,
      fileName: item.fileName,
      totalPages: item.totalPages,
      lastAccessAt: item.lastAccessAt,
    }))
    .sort((a, b) => b.lastAccessAt - a.lastAccessAt)
}
