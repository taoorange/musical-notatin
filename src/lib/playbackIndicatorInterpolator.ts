import type { VerovioToolkit } from 'verovio/esm'

import type { PlaybackElementIndexEntry } from '@/lib/verovio'
import { resolveVerovioElementStartMs } from '@/lib/verovioAnnotationAnchor'

export interface InterpolatePlaybackIndicatorParams {
  currentMs: number
  totalMs: number
  pageEntries: PlaybackElementIndexEntry[]
  toolkit: VerovioToolkit
  hostRect: DOMRect
  startRatio: number
  spanRatio: number
  findDomRect: (id: string) => DOMRect | null
}

export interface InterpolatePlaybackIndicatorResult {
  progress: number
  hitElementIds: string[]
}

function domLeftToIndicatorProgress(
  rect: DOMRect,
  hostRect: DOMRect,
  startRatio: number,
  spanRatio: number,
): number {
  const hostW = hostRect.width
  if (!Number.isFinite(hostW) || hostW <= 1) return 0
  const xRatio = (rect.left - hostRect.left) / hostW
  const raw = spanRatio > 1e-9 ? (xRatio - startRatio) / spanRatio : 0
  return Math.max(0, Math.min(1, raw))
}

/**
 * 在相邻播放元素的起止时间之间按 currentMs 线性插值横向位置，避免指示线逐音符/逐小节线跳变。
 */
export function interpolatePlaybackIndicatorByTimedEntries(
  params: InterpolatePlaybackIndicatorParams,
): InterpolatePlaybackIndicatorResult | null {
  const { pageEntries, toolkit, hostRect, startRatio, spanRatio, findDomRect } = params
  if (!pageEntries.length || !Number.isFinite(params.currentMs) || params.currentMs < 0) return null

  const timed: { entry: PlaybackElementIndexEntry; ms: number; rect: DOMRect }[] = []
  for (const entry of pageEntries) {
    const ms = resolveVerovioElementStartMs(toolkit, entry.id, params.totalMs)
    if (ms === null) continue
    const rect = findDomRect(entry.id)
    if (!rect || rect.width < 1 || rect.height < 1) continue
    timed.push({ entry, ms, rect })
  }
  if (!timed.length) return null

  timed.sort((a, b) => a.ms - b.ms || a.entry.order - b.entry.order)

  const currentMs = params.currentMs
  let idx = 0
  for (let i = 0; i < timed.length; i += 1) {
    if (timed[i]!.ms <= currentMs + 1e-3) idx = i
    else break
  }

  const cur = timed[idx]!
  const next = timed[Math.min(timed.length - 1, idx + 1)]!

  if (idx >= timed.length - 1 || next.ms <= cur.ms + 1e-3) {
    return {
      progress: domLeftToIndicatorProgress(cur.rect, hostRect, startRatio, spanRatio),
      hitElementIds: [cur.entry.id],
    }
  }

  const spanMs = next.ms - cur.ms
  const t = Math.max(0, Math.min(1, (currentMs - cur.ms) / spanMs))
  const p0 = domLeftToIndicatorProgress(cur.rect, hostRect, startRatio, spanRatio)
  const p1 = domLeftToIndicatorProgress(next.rect, hostRect, startRatio, spanRatio)
  const progress = p0 + (p1 - p0) * t

  return {
    progress: Math.max(0, Math.min(1, progress)),
    hitElementIds: t < 0.5 ? [cur.entry.id] : [next.entry.id],
  }
}
