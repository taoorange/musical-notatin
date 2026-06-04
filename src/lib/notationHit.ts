/** Verovio / OSMD 中可视为「单个乐符」的 SVG id（排除 page / 小节等结构容器）。 */
export function isNotationElementId(id: string): boolean {
  const trimmed = id.trim().replace(/^#/, '')
  if (!trimmed) return false
  if (!/[A-Za-z]/.test(trimmed)) return false
  if (/^page-/i.test(trimmed)) return false
  if (/^m\d+_\d+$/i.test(trimmed)) return false
  const lower = trimmed.toLowerCase()
  return lower.includes('note') || lower.includes('rest') || lower.includes('chord')
}

function findNotationElementIdFrom(element: Element, root: HTMLElement): string | null {
  let cur: Element | null = element
  while (cur && root.contains(cur)) {
    const id = cur.getAttribute('id')?.trim()
    if (id && isNotationElementId(id)) return id
    cur = cur.parentElement
  }
  return null
}

const CLICK_HIGHLIGHT_TAGS = new Set(['path', 'ellipse', 'use'])

/**
 * 判断是否应对当前图形节点施加点击高亮。
 * 仅允许 path / ellipse / use，避免给 g / svg 容器加 fill 导致整页继承变蓝。
 */
export function shouldApplyClickHighlight(element: Element, root: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase()
  if (!CLICK_HIGHLIGHT_TAGS.has(tag)) return false
  const selfId = element.getAttribute('id')?.trim()
  if (selfId && isNotationElementId(selfId)) return true
  if (findNotationElementIdFrom(element, root)) return true
  // OSMD：符头 path 常在小节 g（m3_0）下，无 note/rest id，但仍应高亮单个图形。
  const anchor = element.closest('[id]')
  const anchorId = anchor?.getAttribute('id')?.trim()
  return !!(anchorId && !/^page-/i.test(anchorId))
}

/**
 * 在乐谱视口内根据屏幕坐标查找 Verovio 生成的、可用于 `getTimeForElement` 的 SVG 元素 id。
 */
export function findNotationXmlIdUnderPoint(
  clientX: number,
  clientY: number,
  queryRoot: HTMLElement,
  isValidNotationId: (xmlId: string) => boolean,
): string | null {
  if (typeof document === 'undefined' || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  const hit = document.elementFromPoint(clientX, clientY)
  if (!hit || !queryRoot.contains(hit)) return null
  let cur: Element | null = hit as Element
  while (cur && queryRoot.contains(cur)) {
    const id = cur.getAttribute('id')?.trim()
    if (id && isValidNotationId(id)) return id
    cur = cur.parentElement
  }
  return null
}
