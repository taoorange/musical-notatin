import { isAnnotationDebugEnabled } from './annotationDebug'

function roundMs(ms: number): number {
  return Math.round(ms * 10) / 10
}

export interface OrchestraPerfMark {
  label: string
  deltaMs: number
  cumulativeMs: number
}

export interface OrchestraPerfHandle {
  mark: (label: string) => void
  finish: (extra?: Record<string, unknown>) => void
}

class OrchestraPerfTimer implements OrchestraPerfHandle {
  private readonly scope: string
  private readonly startedAt: number
  private lastAt: number
  private marks: OrchestraPerfMark[] = []

  constructor(scope: string) {
    this.scope = scope
    this.startedAt = performance.now()
    this.lastAt = this.startedAt
  }

  mark(label: string): void {
    const at = performance.now()
    this.marks.push({
      label,
      deltaMs: roundMs(at - this.lastAt),
      cumulativeMs: roundMs(at - this.startedAt),
    })
    this.lastAt = at
  }

  finish(extra?: Record<string, unknown>): void {
    if (!isAnnotationDebugEnabled()) return
    const totalMs = roundMs(performance.now() - this.startedAt)
    // eslint-disable-next-line no-console
    console.log(`[orchestra-perf] ${this.scope}`, {
      totalMs,
      marks: this.marks,
      ...extra,
    })
  }
}

/** 仅在 `VITE_ORCHESTRA_DEBUG_CONSOLE=true` 时记录并输出 `[orchestra-perf]` 日志。 */
export function createOrchestraPerfTimer(scope: string): OrchestraPerfHandle {
  if (!isAnnotationDebugEnabled()) {
    return { mark: () => {}, finish: () => {} }
  }
  return new OrchestraPerfTimer(scope)
}
