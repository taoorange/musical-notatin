import type { TimemapEntry, VerovioToolkit } from 'verovio/esm'

export interface SemanticPlaybackRow {
  tickStart: number
  tickEnd: number
  progressStart: number
  progressEnd: number
  page: number
  system: number
}

/** 首声部小节顺序与 MusicXML `number`；tick 为 divisions 累计，可与 MIDI 总长按比例对齐。 */
export interface MusicXmlMeasureTickRange {
  measureListIndex0: number
  measure: number
  tickStart: number
  tickEnd: number
}

export function parseMeasureTickRangesFromMusicXml(musicXml: string): MusicXmlMeasureTickRange[] {
  if (!musicXml.trim()) return []
  // DOMParser 对外部 DTD 的容错在不同浏览器不一致，先去掉 DOCTYPE 提高稳定性。
  const xml = musicXml.replace(/<!DOCTYPE[^>]*>/gi, '')
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return []

  const scorePartwise = doc.documentElement
  if (!scorePartwise || scorePartwise.localName !== 'score-partwise') return []
  const part = Array.from(scorePartwise.children).find((el) => el.localName === 'part') as Element | undefined
  if (!part) return []

  const measures = Array.from(part.children).filter((el) => el.localName === 'measure')
  const out: MusicXmlMeasureTickRange[] = []
  let runningTick = 0

  measures.forEach((measureEl, measureListIndex0) => {
    const numberAttr = Number(measureEl.getAttribute('number') ?? measureListIndex0 + 1)
    const measureNumber = Number.isFinite(numberAttr)
      ? Math.max(1, Math.floor(numberAttr))
      : measureListIndex0 + 1

    let cursor = 0
    let maxCursor = 0
    let lastNoteStart = 0

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
      const end = start + safeDur
      if (!isChord) {
        lastNoteStart = cursor
        cursor += safeDur
      }
      maxCursor = Math.max(maxCursor, cursor, end)
    })

    const measureTicks = Math.max(1, Math.floor(maxCursor))
    const tickStart = runningTick
    const tickEnd = runningTick + measureTicks
    out.push({ measureListIndex0, measure: measureNumber, tickStart, tickEnd })
    runningTick = tickEnd
  })

  return out
}

interface MeasureTimemapAgg {
  minTs: number
  maxTs: number
  page: number
  system: number
}

type TimemapEntryLoose = TimemapEntry & {
  qstamp?: number
  tempo?: number
  on?: string[]
}

function normalizeRows(rows: SemanticPlaybackRow[], totalTicks: number): SemanticPlaybackRow[] {
  if (!rows.length) return []
  const safeTotalTicks = Math.max(1, Math.floor(totalTicks || 1))
  const sorted = [...rows]
    .map((row) => ({
      tickStart: Math.max(0, Math.floor(row.tickStart)),
      tickEnd: Math.max(0, Math.floor(row.tickEnd)),
      progressStart: Math.max(0, Math.min(1, row.progressStart)),
      progressEnd: Math.max(0, Math.min(1, row.progressEnd)),
      page: Math.max(1, Math.floor(row.page || 1)),
      system: Math.max(1, Math.floor(row.system || 1)),
    }))
    .sort((a, b) => a.tickStart - b.tickStart || a.progressStart - b.progressStart)

  const out: SemanticPlaybackRow[] = []
  for (const row of sorted) {
    const tickStart = row.tickStart
    const tickEnd = Math.max(tickStart + 1, row.tickEnd)
    const progressStart = row.progressStart
    const progressEnd = Math.max(progressStart + 1e-6, row.progressEnd)
    out.push({ tickStart, tickEnd, progressStart, progressEnd, page: row.page, system: row.system })
  }

  if (!out.length) return []
  out[0].tickStart = 0
  out[0].progressStart = 0
  out[out.length - 1].tickEnd = Math.max(out[out.length - 1].tickEnd, safeTotalTicks)
  out[out.length - 1].progressEnd = 1
  return out
}

function buildMeasureTimemapAgg(timemap: TimemapEntry[], totalPages: number): Map<number, MeasureTimemapAgg> {
  const out = new Map<number, MeasureTimemapAgg>()
  timemap.forEach((entry) => {
    const measure = Number(entry.measureOn)
    const ts = Number(entry.tstamp)
    if (!Number.isFinite(measure) || !Number.isFinite(ts)) return
    const safeMeasure = Math.max(1, Math.floor(measure))
    const safePage = Math.max(1, Math.min(totalPages, Math.floor(Number(entry.pageOn) || 1)))
    const safeSystem = Math.max(1, Math.floor(Number(entry.systemOn) || 1))

    const prev = out.get(safeMeasure)
    if (!prev) {
      out.set(safeMeasure, {
        minTs: ts,
        maxTs: ts,
        page: safePage,
        system: safeSystem,
      })
      return
    }
    prev.minTs = Math.min(prev.minTs, ts)
    prev.maxTs = Math.max(prev.maxTs, ts)
    // 取该小节最后出现的页/系统（更贴近播放光标向后推进的视觉）
    prev.page = safePage
    prev.system = safeSystem
  })
  return out
}

function mapProgressToPage(progress: number, totalPages: number, pageBoundaryProgress: number[]): number {
  if (totalPages <= 1) return 1
  const p = Math.max(0, Math.min(1, progress))
  if (pageBoundaryProgress.length === totalPages) {
    for (let i = 0; i < pageBoundaryProgress.length; i += 1) {
      if (p <= pageBoundaryProgress[i] || i === pageBoundaryProgress.length - 1) {
        return i + 1
      }
    }
  }
  return Math.max(1, Math.min(totalPages, Math.floor(p * totalPages) + 1))
}

function mapProgressToSystem(progress: number, systemBoundaryProgress: number[]): number {
  const p = Math.max(0, Math.min(1, progress))
  if (systemBoundaryProgress.length === 0) return 1
  for (let i = 0; i < systemBoundaryProgress.length; i += 1) {
    if (p <= systemBoundaryProgress[i] || i === systemBoundaryProgress.length - 1) {
      return i + 1
    }
  }
  return systemBoundaryProgress.length
}

function buildRowsFromTimemapFallback(
  timemap: TimemapEntryLoose[],
  totalPages: number,
  totalTicks: number,
  pageBoundaryProgress: number[] = [],
  systemBoundaryProgressByPage: number[][] = [],
  resolvePageFromElements?: (ids: string[]) => number | null,
): SemanticPlaybackRow[] {
  if (!Array.isArray(timemap) || timemap.length === 0) return []
  const safeTotalTicks = Math.max(1, Math.floor(totalTicks || 1))
  const sorted = [...timemap]
    .map((entry) => ({
      tstamp: Number(entry.tstamp),
      pageOn: Number(entry.pageOn),
      on: Array.isArray(entry.on) ? entry.on : [],
      system: Math.max(1, Math.floor(Number(entry.systemOn) || 1)),
    }))
    .filter((entry) => Number.isFinite(entry.tstamp))
    .sort((a, b) => a.tstamp - b.tstamp)

  if (sorted.length === 0) return []

  const maxTs = Math.max(...sorted.map((entry) => entry.tstamp).filter((v) => Number.isFinite(v)), 1)
  const rows: SemanticPlaybackRow[] = []
  let prevTs = 0
  let prevTick = 0
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i]
    const curTs = Math.max(prevTs, Math.max(0, Math.min(1, cur.tstamp / maxTs)))
    const curTick = Math.max(prevTick, Math.floor(curTs * safeTotalTicks))
    const next = sorted[i + 1]
    const nextTs = next ? Math.max(curTs, Math.max(0, Math.min(1, next.tstamp / maxTs))) : 1
    const nextTick = Math.max(curTick + 1, Math.floor(nextTs * safeTotalTicks))
    let page = Math.max(1, Math.min(totalPages, Math.floor(cur.pageOn || 1)))
    // 无 pageOn 时不要用 elementPageMap 取页：总谱/宽版下 timemap 的 `on` 顺序与 id 首次出现页
    // 易与归一化 tstamp→tick 不一致，导致过早翻页、指示线找不到 DOM、听感错乱。
    if (!Number.isFinite(cur.pageOn) || cur.pageOn <= 0) {
      const onIds = Array.isArray(cur.on) ? cur.on.filter((id) => typeof id === 'string' && id.trim().length > 0) : []
      const resolvedPage = resolvePageFromElements?.(onIds)
      page = resolvedPage && Number.isFinite(resolvedPage)
        ? Math.max(1, Math.min(totalPages, Math.floor(resolvedPage)))
        : mapProgressToPage(curTs, totalPages, pageBoundaryProgress)
    }
    const system = mapProgressToSystem(curTs, systemBoundaryProgressByPage[page - 1] ?? [])
    rows.push({
      tickStart: curTick,
      tickEnd: nextTick,
      progressStart: curTs,
      progressEnd: nextTs,
      page,
      system,
    })
    prevTs = curTs
    prevTick = curTick
  }
  if (rows.length > 0) {
    rows[0].tickStart = 0
    rows[0].progressStart = 0
    rows[rows.length - 1].tickEnd = Math.max(rows[rows.length - 1].tickEnd, safeTotalTicks)
    rows[rows.length - 1].progressEnd = 1
  }
  return rows
}

export function buildSemanticPlaybackRows(
  sourceXml: string,
  toolkit: VerovioToolkit,
  options: {
    totalTicks?: number
    pageBoundaryProgress?: number[]
    systemBoundaryProgressByPage?: number[][]
    elementPageResolver?: (id: string) => number | null
  } = {},
): SemanticPlaybackRow[] {
  const totalTicks = Math.max(0, Math.floor(Number(options.totalTicks) || 0))
  const totalPages = Math.max(1, toolkit.getPageCount())
  const pageBoundaryProgress = Array.isArray(options.pageBoundaryProgress) ? options.pageBoundaryProgress : []
  const systemBoundaryProgressByPage = Array.isArray(options.systemBoundaryProgressByPage)
    ? options.systemBoundaryProgressByPage
    : []
  const timemap = toolkit.renderToTimemap() as TimemapEntryLoose[]
  if (!Array.isArray(timemap) || timemap.length === 0) return []
  const hasPageOnInTimemap = timemap.some((entry) => Number.isFinite(Number(entry.pageOn)) && Number(entry.pageOn) > 0)

  const debugEnabled =
    String(import.meta.env.VITE_ORCHESTRA_DEBUG_CONSOLE ?? '').trim().toLowerCase() === 'true'
  if (debugEnabled) {
    const uniqueTsValues = Array.from(
      new Set(timemap.map((entry) => Number(entry.tstamp)).filter((value) => Number.isFinite(value))),
    ).sort((a, b) => a - b)
    const measureValues = timemap.map((entry) => Number(entry.measureOn)).filter((v) => Number.isFinite(v) && v > 0)
    const pageValues = timemap.map((entry) => Number(entry.pageOn)).filter((v) => Number.isFinite(v) && v > 0)
    const systemValues = timemap.map((entry) => Number(entry.systemOn)).filter((v) => Number.isFinite(v) && v > 0)
    const timemapSample = timemap.slice(0, 5).map((entry, idx) => ({
      idx,
      tstamp: entry.tstamp,
      qstamp: entry.qstamp,
      measureOn: entry.measureOn,
      pageOn: entry.pageOn,
      systemOn: entry.systemOn,
      tempo: entry.tempo,
      on: entry.on,
    }))
    const tsGaps = uniqueTsValues.slice(1, 20).map((ts, idx) => ts - uniqueTsValues[idx])
    // eslint-disable-next-line no-console
    console.log('[semantic-lib]:timemap', {
      timemapLen: timemap.length,
      uniqueTsCount: uniqueTsValues.length,
      measureCount: new Set(measureValues).size,
      pageCount: new Set(pageValues).size,
      systemCount: new Set(systemValues).size,
      hasPageOnInTimemap,
      totalPages,
      totalTicks,
      hasSourceXml: sourceXml.trim().length > 0,
      minTstamp: uniqueTsValues[0] ?? null,
      maxTstamp: uniqueTsValues[uniqueTsValues.length - 1] ?? null,
      timemapSample,
      measureOnSamples: measureValues.slice(0, 20),
      pageOnSamples: pageValues.slice(0, 20),
      systemOnSamples: systemValues.slice(0, 20),
      uniqueTsSamples: uniqueTsValues.slice(0, 20),
      tsGaps,
      firstEntry: timemap[0] ?? null,
      lastEntry: timemap[timemap.length - 1] ?? null,
    })
  }

  const resolvePageByDomMap = options.elementPageResolver
  const resolvePageFromElements = (ids: string[]): number | null => {
    if (typeof resolvePageByDomMap === 'function') {
      for (const id of ids) {
        const trimmed = id.trim().replace(/^#/, '')
        if (!trimmed) continue
        const page = Number(resolvePageByDomMap(trimmed))
        if (Number.isFinite(page) && page > 0) return page
      }
    }
    const fn = (toolkit as VerovioToolkit & { getPageWithElement?: (id: string) => number }).getPageWithElement
    if (typeof fn !== 'function' || !ids.length) return null
    for (const id of ids) {
      const trimmed = id.trim().replace(/^#/, '')
      if (!trimmed) continue
      const page = Number(fn.call(toolkit, trimmed))
      if (Number.isFinite(page) && page > 0) return page
    }
    return null
  }

  const directRowsRaw = buildRowsFromTimemapFallback(
    timemap,
    totalPages,
    totalTicks,
    pageBoundaryProgress,
    systemBoundaryProgressByPage,
    resolvePageFromElements,
  )
  const directRows = normalizeRows(directRowsRaw, totalTicks)
  if (debugEnabled) {
    const directTickSpans = directRowsRaw.slice(0, 20).map((row) => ({
      tickStart: row.tickStart,
      tickEnd: row.tickEnd,
      progressStart: row.progressStart,
      progressEnd: row.progressEnd,
      page: row.page,
      system: row.system,
    }))
    const directPageSetSize = new Set(directRowsRaw.map((row) => row.page)).size
    const directSystemSetSize = new Set(directRowsRaw.map((row) => row.system)).size
    const directProgressSpanPreview = directRowsRaw.slice(0, 12).map((row) => [row.progressStart, row.progressEnd])
    // eslint-disable-next-line no-console
    console.log('[semantic-lib]:direct-path', {
      rawRows: directRowsRaw.length,
      normalizedRows: directRows.length,
      directPageSetSize,
      directSystemSetSize,
      directProgressSpanPreview,
      firstRow: directRows[0] ?? null,
      lastRow: directRows[directRows.length - 1] ?? null,
      directTickSpans,
    })
  }
  if (directRows.length > 0) {
    return directRows
  }

  const measureTickRanges = parseMeasureTickRangesFromMusicXml(sourceXml)
  const measureAgg = buildMeasureTimemapAgg(timemap, totalPages)
  if (debugEnabled) {
    const measureKeys = Array.from(measureAgg.keys()).slice(0, 40)
    const measureAggSamples = measureKeys.map((measure) => ({
      measure,
      ...(measureAgg.get(measure) ?? {}),
    }))
    const measureRangeSamples = measureTickRanges.slice(0, 40)
    const measurePageSetSize = new Set(Array.from(measureAgg.values()).map((item) => item.page)).size
    const measureSystemSetSize = new Set(Array.from(measureAgg.values()).map((item) => item.system)).size
    // eslint-disable-next-line no-console
    console.log('[semantic-lib]:measure-path', {
      measureTickRangesLen: measureTickRanges.length,
      measureAggSize: measureAgg.size,
      measurePageSetSize,
      measureSystemSetSize,
      measureRangeSamples,
      measureAggSamples,
    })
  }
  if (measureAgg.size === 0 || measureTickRanges.length === 0) {
    return []
  }

  const rows: SemanticPlaybackRow[] = []
  let prevProgressEnd = 0
  for (const range of measureTickRanges) {
    const agg = measureAgg.get(range.measure)
    if (!agg) continue
    const tickStart = Math.max(0, Math.floor(range.tickStart))
    const tickEnd = Math.max(tickStart + 1, Math.floor(range.tickEnd))
    const progressStart = Math.max(prevProgressEnd, Math.max(0, Math.min(1, agg.minTs)))
    const progressEnd = Math.max(progressStart, Math.max(0, Math.min(1, agg.maxTs)))
    rows.push({
      tickStart,
      tickEnd,
      progressStart,
      progressEnd,
      page: agg.page,
      system: agg.system,
    })
    prevProgressEnd = progressEnd
  }

  if (rows.length > 0) {
    rows[rows.length - 1].progressEnd = 1
    const normalized = normalizeRows(rows, totalTicks)
    if (debugEnabled) {
      const normalizedSpans = normalized.slice(0, 40).map((row) => ({
        tickStart: row.tickStart,
        tickEnd: row.tickEnd,
        progressStart: row.progressStart,
        progressEnd: row.progressEnd,
        page: row.page,
        system: row.system,
      }))
      // eslint-disable-next-line no-console
      console.log('[semantic-lib]:measure-result', {
        rawRows: rows.length,
        normalizedRows: normalized.length,
        firstRow: normalized[0] ?? null,
        lastRow: normalized[normalized.length - 1] ?? null,
        normalizedSpans,
      })
    }
    return normalized
  }

  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[semantic-lib]:measure-result-empty', {
      rowsLen: rows.length,
      measureTickRangesLen: measureTickRanges.length,
      measureAggSize: measureAgg.size,
    })
  }

  return []
}

export function mapTickToSemanticPlayback(
  tick: number,
  rows: SemanticPlaybackRow[],
): { progress: number; page: number; system: number } | null {
  if (!rows.length) return null
  const t = Math.max(0, Math.floor(tick))
  let lo = 0
  let hi = rows.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (rows[mid].tickEnd <= t) lo = mid + 1
    else hi = mid
  }
  const row = rows[Math.min(rows.length - 1, lo)]
  if (!row) return null
  const spanTicks = Math.max(1, row.tickEnd - row.tickStart)
  const local = Math.max(0, Math.min(1, (t - row.tickStart) / spanTicks))
  const progress = row.progressStart + (row.progressEnd - row.progressStart) * local
  return { progress: Math.max(0, Math.min(1, progress)), page: row.page, system: row.system }
}
