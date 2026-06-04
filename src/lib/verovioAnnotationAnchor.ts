import type { VerovioToolkit } from 'verovio/esm'

/**
 * 将 Verovio `getTimeForElement` 的返回值规范为毫秒（用于与 `currentMidiTotalMs` 线性对齐到 tick）。
 * 部分版本返回秒级浮点，若总时长较大且返回值偏小则乘以 1000。
 */
export function resolveVerovioElementStartMs(
  toolkit: VerovioToolkit,
  xmlId: string,
  totalMsHint: number,
): number | null {
  const tk = toolkit as VerovioToolkit & { getTimeForElement?: (id: string) => number }
  if (typeof tk.getTimeForElement !== 'function') return null
  let v = tk.getTimeForElement(xmlId)
  if (!Number.isFinite(v) || v < 0) return null
  if (totalMsHint > 15_000 && v < 8000 && v * 1000 <= totalMsHint * 1.25) {
    v *= 1000
  }
  return v
}
