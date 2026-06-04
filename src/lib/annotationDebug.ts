/**
 * 标注锚点 / 导出 MusicXML 的调试日志。
 * 与播放对齐等调试共用：仅在 `VITE_ORCHESTRA_DEBUG_CONSOLE=true` 时输出（开发见 `.env.development`，生产见 `.env.production`）。
 */
export function isAnnotationDebugEnabled(): boolean {
  return (
    String(import.meta.env.VITE_ORCHESTRA_DEBUG_CONSOLE ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

export function annotationDebugLog(tag: string, payload: unknown): void {
  if (!isAnnotationDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.log(`[annotation-debug] ${tag}`, payload)
}
