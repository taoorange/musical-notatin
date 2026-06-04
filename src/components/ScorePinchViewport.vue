<template>
  <div
    ref="viewportRef"
    class="score-pinch-viewport"
    :class="{ 'score-pinch-viewport--zoomed': isZoomedIn }"
    :style="viewportStyle"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
    @pointerdown="onViewportPointerDown"
  >
    <div class="score-pinch-spacer" :style="spacerStyle">
      <div
        ref="innerRef"
        class="score-pinch-inner"
        :style="transformStyle"
        @click="onInnerClick"
      >
        <div class="score-svg-layer" v-html="processedSvgHtml" />
        <div
          v-for="annotation in displayedAnnotations"
          :key="annotation.id"
          class="score-annotation"
          :style="annotationStyle(annotation)"
          @pointerdown="onAnnotationPointerDown($event, annotation.id)"
          @touchstart="onAnnotationTouchStart($event, annotation.id)"
          @dblclick.stop="onAnnotationDoubleClick(annotation.id)"
        >
          <img v-if="annotation.icon" class="score-annotation-icon" :src="annotation.icon" alt="" />
          <span>{{ annotation.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { shouldApplyClickHighlight } from '@/lib/notationHit'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface ScoreViewportAnnotation {
  id: string
  page?: number
  x: number
  y: number
  text: string
  color: string
  icon?: string
}

const props = withDefaults(
  defineProps<{
    /** 当前页 Verovio 输出的 SVG 字符串 */
    svgHtml: string
    annotations: ScoreViewportAnnotation[]
    annotationEnabled?: boolean
    /** 为 false 时不渲染标注层（数据仍由父组件保存） */
    showAnnotations?: boolean
    /** 滚动拼接模式：按 page 字段映射标注到对应页块 */
    scrollMode?: boolean
    /** 当前播放高亮命中的 note/rest 元素 id 列表 */
    playbackHitElementIds?: string[]
  }>(),
  {
    showAnnotations: true,
    scrollMode: false,
    playbackHitElementIds: () => [],
  },
)

let scrollResizeObserver: ResizeObserver | null = null
/** 布局变化时递增，使模板重算标注 `left/top`（墨迹坐标 → inner 百分比依赖 DOM 几何） */
const layoutVersion = ref(0)

function bumpLayoutVersion() {
  layoutVersion.value += 1
}

const displayedAnnotations = computed(() => {
  if (!props.showAnnotations) return []
  return props.annotations
})

const processedSvgHtml = computed(() => injectPlaybackMarkers(props.svgHtml))
const playbackHitElementIdSet = computed(() => new Set(props.playbackHitElementIds.map((id) => id.trim()).filter(Boolean)))

const emit = defineEmits<{
  (
    e: 'add-annotation',
    payload: {
      x: number
      y: number
      page?: number
      /** 屏幕坐标，用于命中 Verovio SVG 音符以写入 MusicXML 锚点 */
      clientX: number
      clientY: number
    },
  ): void
  (
    e: 'move-annotation',
    payload: {
      id: string
      x: number
      y: number
      page?: number
    },
  ): void
  (
    e: 'remove-annotation',
    payload: { id: string; source?: 'long-press' | 'double-click' },
  ): void
  (e: 'viewport-activity', payload: { type: 'zoom' | 'drag' | 'tap' }): void
  (e: 'zoom-state-change', payload: { zoomed: boolean }): void
  (
    e: 'note-click',
    payload: { clientX: number; clientY: number; x: number; y: number; page?: number },
  ): void
}>()

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SCALE_UNIT = 1
const LONG_PRESS_MS = 600
const DRAG_START_THRESHOLD_PX = 8
const DOUBLE_CLICK_MS = 320

const viewportRef = ref<HTMLDivElement | null>(null)
const innerRef = ref<HTMLDivElement | null>(null)
const scale = ref(1)
/** 放大前视口可见高度；锁定后由 overflow 滚动承载放大内容 */
const viewportLockedHeight = ref<number | null>(null)
/** 放大前 inner 布局尺寸，用于 transform 缩放占位 */
const baseInnerWidth = ref<number | null>(null)
const baseInnerHeight = ref<number | null>(null)
const pinchState = ref<{
  active: boolean
  startDistance: number
  startScale: number
} | null>(null)
const panState = ref<{
  active: boolean
  pointerId: number | null
  startX: number
  startY: number
  startScrollLeft: number
  startScrollTop: number
} | null>(null)
const draggingAnnotationId = ref<string | null>(null)
const hasDragged = ref(false)
const activePointerId = ref<number | null>(null)
const activeTouchId = ref<number | null>(null)
let lastPointerDownAt = 0
const lastPrimaryPress = ref<{
  id: string
  at: number
  x: number
  y: number
} | null>(null)
const longPressState = ref<{
  id: string
  startX: number
  startY: number
  triggered: boolean
  timer: number | null
} | null>(null)

/** scale > 1：进入放大态（锁定视口高度、可拖动） */
const isZoomedIn = computed(() => scale.value > SCALE_UNIT + 0.001)
/** scale !== 1：启用 transform 缩放（含缩小） */
const isScaled = computed(() => Math.abs(scale.value - SCALE_UNIT) > 0.001)

const spacerStyle = computed(() => {
  if (!isScaled.value || baseInnerWidth.value === null || baseInnerHeight.value === null) return undefined
  const s = scale.value
  return {
    width: `${baseInnerWidth.value * s}px`,
    height: `${baseInnerHeight.value * s}px`,
  }
})

const transformStyle = computed(() => {
  if (!isScaled.value || baseInnerWidth.value === null || baseInnerHeight.value === null) return undefined
  const s = scale.value
  return {
    width: `${baseInnerWidth.value}px`,
    height: `${baseInnerHeight.value}px`,
    transform: `scale(${s})`,
    transformOrigin: '0 0',
  }
})

const viewportStyle = computed(() => {
  if (!isZoomedIn.value || viewportLockedHeight.value === null) return undefined
  const height = viewportLockedHeight.value
  return {
    height: `${height}px`,
    maxHeight: `${height}px`,
  }
})

/** 计算视口在 ion-content / 窗口中的可见高度，避免锁定全页高度导致桌面端看不全 */
function getVisibleViewportHeight(viewport: HTMLElement): number {
  const rect = viewport.getBoundingClientRect()
  if (rect.height <= 0) return 0

  const clipRects: DOMRect[] = []
  const ionContent = viewport.closest('ion-content')
  if (ionContent) {
    clipRects.push(ionContent.getBoundingClientRect())
  }
  clipRects.push(new DOMRect(0, 0, window.innerWidth, window.innerHeight))

  let visibleTop = rect.top
  let visibleBottom = rect.bottom
  for (const clip of clipRects) {
    visibleTop = Math.max(visibleTop, clip.top)
    visibleBottom = Math.min(visibleBottom, clip.bottom)
  }

  const visibleHeight = visibleBottom - visibleTop
  if (visibleHeight > 0 && visibleHeight < rect.height) {
    return visibleHeight
  }
  return rect.height
}

function captureBaseMetricsIfNeeded() {
  if (baseInnerWidth.value !== null && baseInnerHeight.value !== null) return
  const inner = innerRef.value
  if (!inner) return
  baseInnerWidth.value = inner.offsetWidth
  baseInnerHeight.value = inner.scrollHeight
}

function lockViewportMetricsIfNeeded() {
  if (viewportLockedHeight.value !== null) return
  const viewport = viewportRef.value
  if (!viewport) return
  captureBaseMetricsIfNeeded()
  if (baseInnerWidth.value === null || baseInnerHeight.value === null || baseInnerWidth.value <= 0 || baseInnerHeight.value <= 0) {
    return
  }
  const visibleHeight = Math.round(getVisibleViewportHeight(viewport))
  if (visibleHeight <= 0) return
  viewportLockedHeight.value = Math.max(120, visibleHeight)
}

function unlockViewportMetrics() {
  viewportLockedHeight.value = null
  baseInnerWidth.value = null
  baseInnerHeight.value = null
}

function isPanTargetBlocked(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest('.score-annotation')
}

function startPan(clientX: number, clientY: number, pointerId: number | null = null) {
  const viewport = viewportRef.value
  if (!viewport || !isZoomedIn.value) return
  lockViewportMetricsIfNeeded()
  panState.value = {
    active: true,
    pointerId,
    startX: clientX,
    startY: clientY,
    startScrollLeft: viewport.scrollLeft,
    startScrollTop: viewport.scrollTop,
  }
  emit('viewport-activity', { type: 'drag' })
}

function applyPan(clientX: number, clientY: number) {
  const viewport = viewportRef.value
  const pan = panState.value
  if (!viewport || !pan?.active) return
  const dx = clientX - pan.startX
  const dy = clientY - pan.startY
  if (Math.hypot(dx, dy) > DRAG_START_THRESHOLD_PX) {
    hasDragged.value = true
  }
  viewport.scrollLeft = pan.startScrollLeft - dx
  viewport.scrollTop = pan.startScrollTop - dy
}

function endPan() {
  panState.value = null
}

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
}

function getDistance(touches: TouchList): number {
  if (touches.length < 2) return 0
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function getCenter(touches: TouchList): { x: number; y: number } {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  }
}

function zoomAt(nextScale: number, centerX: number, centerY: number) {
  const viewport = viewportRef.value
  const prevScale = scale.value
  const targetScale = clampScale(nextScale)
  if (!viewport || Math.abs(targetScale - prevScale) < 0.001) {
    scale.value = targetScale
    return
  }

  const rect = viewport.getBoundingClientRect()
  const localX = centerX - rect.left
  const localY = centerY - rect.top
  const contentX = viewport.scrollLeft + localX
  const contentY = viewport.scrollTop + localY
  const ratio = targetScale / prevScale

  if (Math.abs(prevScale - SCALE_UNIT) <= 0.001 && Math.abs(targetScale - SCALE_UNIT) > 0.001) {
    captureBaseMetricsIfNeeded()
  }
  if (targetScale > SCALE_UNIT + 0.001) {
    lockViewportMetricsIfNeeded()
  } else {
    viewportLockedHeight.value = null
  }
  if (Math.abs(targetScale - SCALE_UNIT) <= 0.001) {
    unlockViewportMetrics()
  }

  scale.value = targetScale
  void nextTick(() => {
    viewport.scrollLeft = contentX * ratio - localX
    viewport.scrollTop = contentY * ratio - localY
    bumpLayoutVersion()
  })
}

function onViewportWheel(ev: WheelEvent) {
  const viewport = viewportRef.value
  if (!viewport) return

  // 桌面触控板/鼠标：Ctrl/⌘ + 滚轮缩放
  if (ev.ctrlKey || ev.metaKey) {
    ev.preventDefault()
    ev.stopPropagation()
    emit('viewport-activity', { type: 'zoom' })
    const zoomFactor = Math.exp(-ev.deltaY * 0.002)
    zoomAt(scale.value * zoomFactor, ev.clientX, ev.clientY)
    return
  }

  if (!isZoomedIn.value) return
  ev.preventDefault()
  ev.stopPropagation()
  viewport.scrollLeft += ev.deltaX
  viewport.scrollTop += ev.deltaY
}

function onViewportPointerDown(ev: PointerEvent) {
  if (!isZoomedIn.value || ev.button !== 0 || ev.pointerType === 'touch') return
  if (isPanTargetBlocked(ev.target)) return
  startPan(ev.clientX, ev.clientY, ev.pointerId)
  ev.preventDefault()
}

function onTouchStart(ev: TouchEvent) {
  if (ev.touches.length === 1 && isZoomedIn.value) {
    if (isPanTargetBlocked(ev.target)) return
    startPan(ev.touches[0].clientX, ev.touches[0].clientY)
    return
  }
  if (ev.touches.length < 2) return
  emit('viewport-activity', { type: 'zoom' })
  const startDistance = getDistance(ev.touches)
  if (startDistance <= 0) return
  pinchState.value = {
    active: true,
    startDistance,
    startScale: scale.value,
  }
}

function onTouchMove(ev: TouchEvent) {
  if (panState.value?.active && ev.touches.length === 1) {
    ev.preventDefault()
    ev.stopPropagation()
    applyPan(ev.touches[0].clientX, ev.touches[0].clientY)
    return
  }
  if (ev.touches.length < 2 || !pinchState.value?.active) return
  const distance = getDistance(ev.touches)
  if (distance <= 0) return

  // 仅在双指缩放时阻止默认行为，避免触发页面级缩放手势
  ev.preventDefault()
  const ratio = distance / pinchState.value.startDistance
  const center = getCenter(ev.touches)
  zoomAt(pinchState.value.startScale * ratio, center.x, center.y)
}

function onTouchEnd(ev: TouchEvent) {
  if (ev.touches.length === 0) {
    endPan()
  }
  if (ev.touches.length >= 2) return
  pinchState.value = null
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * 将屏幕坐标映射到「谱面墨迹」的 0–1 比例（与 OSMD `pageMeasureInkNormSpans` 同一参照）。
 * OSMD / Verovio 的整页 SVG 常在 viewBox 留白；若仍按外层 div 宽高归一化，点击会系统性偏移，
 * 且一页多 system 时仅用 x 无法区分上下行小节锚点。
 */
/**
 * 将屏幕坐标映射到容器相对归一化坐标 (0-1)。
 * 使用 DOM rect 而非 SVG bbox/CTM，避免 CSS 缩放与 SVG 内部坐标系统之间的漂移。
 */
function clientToMusicNormXYInContainer(
  container: HTMLElement | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!container) return null
  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  }
}

/** 为带 `id` 的 SVG 节点注入 `data-playback-id`，供播放高亮按 DOM 命中（与 Verovio/OSMD 无关）。 */
function injectPlaybackMarkers(svgHtml: string): string {
  if (!svgHtml.trim()) return svgHtml
  return svgHtml.replace(/\sid="([^"]+)"/g, (match, id) => {
    const trimmed = id.trim().replace(/^#/, '')
    if (!trimmed) return match
    if (/\bdata-playback-id=/.test(match)) return match
    return `${match} data-playback-id="${trimmed}"`
  })
}

function decoratePlaybackHitElements(root: HTMLElement | null) {
  if (!root) return
  const hitIds = playbackHitElementIdSet.value
  const elements = root.querySelectorAll<HTMLElement>('[data-playback-id]')
  elements.forEach((el) => {
    const id = (el.getAttribute('data-playback-id') ?? '').trim()
    const active = !!id && hitIds.has(id)
    el.classList.toggle('playback-hit-element', active)
    el.toggleAttribute('data-playback-hit', active)
  })
}

function getNormalizedPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  return clientToMusicNormXYInContainer(innerRef.value, clientX, clientY)
}

function getScrollPageBlocks(): HTMLElement[] {
  const inner = innerRef.value
  if (!inner) return []
  return Array.from(inner.querySelectorAll<HTMLElement>('.score-scroll-page-block'))
}

function getPageIndexFromClient(clientX: number, clientY: number, pageBlocks: HTMLElement[]): number | null {
  if (pageBlocks.length === 0) return null
  const elementAtPoint =
    typeof document !== 'undefined'
      ? (document.elementFromPoint(clientX, clientY) as HTMLElement | null)
      : null
  const blockAtPoint = elementAtPoint?.closest('.score-scroll-page-block') as HTMLElement | null
  if (blockAtPoint) {
    const index = pageBlocks.indexOf(blockAtPoint)
    if (index >= 0) return index
  }
  const inner = innerRef.value
  if (!inner) return null
  const innerRect = inner.getBoundingClientRect()
  const yInInner = clientY - innerRect.top
  for (let i = 0; i < pageBlocks.length; i += 1) {
    const block = pageBlocks[i]
    const top = block.offsetTop
    const bottom = top + block.offsetHeight
    if (yInInner >= top && yInInner <= bottom) {
      return i
    }
  }
  return null
}

function getNormalizedPointInPage(
  clientX: number,
  clientY: number,
  pageIndex: number,
  pageBlocks: HTMLElement[],
): { x: number; y: number; page: number } | null {
  if (pageIndex < 0 || pageIndex >= pageBlocks.length) return null
  const pageBlock = pageBlocks[pageIndex]!
  const pageRect = pageBlock.getBoundingClientRect()
  if (pageRect.width <= 0 || pageRect.height <= 0) return null
  return {
    x: clamp01((clientX - pageRect.left) / pageRect.width),
    y: clamp01((clientY - pageRect.top) / pageRect.height),
    page: pageIndex + 1,
  }
}



function getAnnotationPoint(
  clientX: number,
  clientY: number,
  preferredPage?: number,
): { x: number; y: number; page?: number } | null {
  if (!props.scrollMode) {
    return getNormalizedPoint(clientX, clientY)
  }
  const pageBlocks = getScrollPageBlocks()
  if (pageBlocks.length === 0) return null
  let pageIndex = getPageIndexFromClient(clientX, clientY, pageBlocks)
  if (pageIndex === null && Number.isFinite(preferredPage)) {
    const preferredIndex = Math.round((preferredPage as number) - 1)
    if (preferredIndex >= 0 && preferredIndex < pageBlocks.length) {
      pageIndex = preferredIndex
    }
  }
  if (pageIndex === null) return null
  return getNormalizedPointInPage(clientX, clientY, pageIndex, pageBlocks)
}

function onInnerClick(ev: MouseEvent) {
  // 点击高亮：标注模式关闭时，查找并高亮点击位置下的乐符元素
  highlightClickedNotationElement(ev.clientX, ev.clientY)

  if (!props.annotationEnabled || hasDragged.value) {
    hasDragged.value = false
    return
  }
  const target = ev.target as HTMLElement | null
  if (target?.closest('.score-annotation')) return
  const point = getAnnotationPoint(ev.clientX, ev.clientY)
  if (!point) return
  emit('add-annotation', {
    ...point,
    clientX: ev.clientX,
    clientY: ev.clientY,
  })
}

/**
 * 查找点击位置下的乐符 SVG 元素并高亮变色，同时发出 note-click 事件用于播放预览。
 * 仅当标注模式关闭时生效。
 */
function highlightClickedNotationElement(clientX: number, clientY: number) {
  if (props.annotationEnabled) return
  const host = innerRef.value
  if (!host) return

  // 清除上一次高亮
  const prev = host.querySelector('.note-click-highlight')
  if (prev) prev.classList.remove('note-click-highlight')

  // 获取点击位置下的最顶层元素
  const hit = document.elementFromPoint(clientX, clientY)
  if (!hit || !host.contains(hit)) return

  // 仅高亮 path / ellipse / use 等图形节点；勿给 g/svg 容器加 class，否则会继承 fill 整页变蓝。
  let cur: Element | null = hit as Element
  while (cur && host.contains(cur)) {
    if (shouldApplyClickHighlight(cur, host)) {
      cur.classList.add('note-click-highlight')
      const point = getAnnotationPoint(clientX, clientY)
      if (point) {
        emit('note-click', {
          clientX,
          clientY,
          x: point.x,
          y: point.y,
          ...(Number.isFinite(point.page) ? { page: point.page } : {}),
        })
      }
      return
    }
    cur = cur.parentElement
  }
}

function onAnnotationPointerDown(ev: PointerEvent, id: string) {
  if (!props.annotationEnabled) return
  // 主键双击兜底：某些环境下 dblclick 不稳定或不派发，改为 pointerdown 时间窗检测。
  if (ev.button === 0) {
    const now = Date.now()
    const previous = lastPrimaryPress.value
    if (previous && previous.id === id && now - previous.at <= DOUBLE_CLICK_MS) {
      const moved = Math.hypot(ev.clientX - previous.x, ev.clientY - previous.y)
      if (moved <= DRAG_START_THRESHOLD_PX) {
        ev.preventDefault()
        ev.stopPropagation()
        emit('remove-annotation', { id, source: 'double-click' })
        lastPrimaryPress.value = null
        activePointerId.value = null
        longPressState.value = null
        draggingAnnotationId.value = null
        hasDragged.value = true
        return
      }
    }
    lastPrimaryPress.value = {
      id,
      at: now,
      x: ev.clientX,
      y: ev.clientY,
    }
  }
  lastPointerDownAt = Date.now()
  ev.preventDefault()
  ev.stopPropagation()
  activePointerId.value = ev.pointerId
  draggingAnnotationId.value = id
  hasDragged.value = false

  setupLongPressIfNeeded(ev.pointerType, id, ev.clientX, ev.clientY)
}

function setupLongPressIfNeeded(pointerType: string, id: string, clientX: number, clientY: number) {
  // 非鼠标指针（touch / pen / 未知）统一走长按删除，兼容 iPad 手指与 Apple Pencil。
  if (pointerType !== 'mouse') {
    const timer = window.setTimeout(() => {
      if (!longPressState.value || longPressState.value.id !== id) return
      longPressState.value.triggered = true
      draggingAnnotationId.value = null
      emit('remove-annotation', { id, source: 'long-press' })
    }, LONG_PRESS_MS)
    longPressState.value = {
      id,
      startX: clientX,
      startY: clientY,
      triggered: false,
      timer,
    }
    return
  }
  longPressState.value = null
}

function onAnnotationTouchStart(ev: TouchEvent, id: string) {
  if (!props.annotationEnabled) return
  // 支持 pointer 的浏览器通常会同时派发 touch 事件，这里做去重。
  if (Date.now() - lastPointerDownAt < 80) return
  const touch = ev.changedTouches[0]
  if (!touch) return
  ev.preventDefault()
  ev.stopPropagation()
  activeTouchId.value = touch.identifier
  draggingAnnotationId.value = id
  hasDragged.value = false
  setupLongPressIfNeeded('touch', id, touch.clientX, touch.clientY)
}

function onAnnotationDoubleClick(id: string) {
  if (!props.annotationEnabled) return
  emit('remove-annotation', { id, source: 'double-click' })
}

function annotationStyle(annotation: ScoreViewportAnnotation): Record<string, string> {
  void layoutVersion.value
  const xn = clamp01(annotation.x)
  const yn = clamp01(annotation.y)
  const base = {
    backgroundColor: `${annotation.color}22`,
    color: annotation.color,
  }

  if (props.scrollMode && innerRef.value) {
    const pg = annotation.page
    if (typeof pg === 'number' && pg >= 1) {
      const layer = innerRef.value.querySelector('.score-svg-layer') as HTMLElement | null
      const blocks = layer?.querySelectorAll<HTMLElement>('.score-scroll-page-block')
      const idx = Math.round(pg) - 1
      const block = blocks?.[idx]
      if (block) {
        const inner = innerRef.value
        const innerRect = inner.getBoundingClientRect()
        const blockRect = block.getBoundingClientRect()
        if (innerRect.width > 0 && innerRect.height > 0) {
          const cx = blockRect.left - innerRect.left + xn * blockRect.width
          const cy = blockRect.top - innerRect.top + yn * blockRect.height
          return {
            ...base,
            left: `${(cx / innerRect.width) * 100}%`,
            top: `${(cy / innerRect.height) * 100}%`,
          }
        }
      }
    }
  }

  return {
    ...base,
    left: `${xn * 100}%`,
    top: `${yn * 100}%`,
  }
}

function onWindowResize() {
  bumpLayoutVersion()
}

function onWindowPointerMove(ev: PointerEvent) {
  const pan = panState.value
  if (pan?.active && pan.pointerId === ev.pointerId) {
    ev.preventDefault()
    applyPan(ev.clientX, ev.clientY)
    return
  }
  if (!props.annotationEnabled || activePointerId.value !== ev.pointerId) return
  const press = longPressState.value
  if (press) {
    if (press.triggered) return
    const moved = Math.hypot(ev.clientX - press.startX, ev.clientY - press.startY)
    if (moved <= DRAG_START_THRESHOLD_PX) return
    if (press.timer !== null) {
      window.clearTimeout(press.timer)
      press.timer = null
    }
    longPressState.value = null
  }
  if (!draggingAnnotationId.value) return
  const point = getAnnotationPoint(ev.clientX, ev.clientY)
  if (!point) return
  hasDragged.value = true
  emit('move-annotation', {
    id: draggingAnnotationId.value,
    x: point.x,
    y: point.y,
    ...(Number.isFinite(point.page) ? { page: point.page } : {}),
  })
}

function onWindowPointerUp(ev: PointerEvent) {
  if (panState.value?.pointerId === ev.pointerId) {
    endPan()
  }
  const press = longPressState.value
  if (press && press.timer !== null) {
    window.clearTimeout(press.timer)
  }
  if (press?.triggered) {
    // 长按触发删除确认后，避免抬手触发新增标注点击。
    hasDragged.value = true
  }
  activePointerId.value = null
  longPressState.value = null
  draggingAnnotationId.value = null
}

function onWindowTouchMove(ev: TouchEvent) {
  if (!props.annotationEnabled || activeTouchId.value === null) return
  const touch = Array.from(ev.touches).find((item) => item.identifier === activeTouchId.value)
  if (!touch) return
  const press = longPressState.value
  if (press) {
    if (press.triggered) return
    const moved = Math.hypot(touch.clientX - press.startX, touch.clientY - press.startY)
    if (moved <= DRAG_START_THRESHOLD_PX) return
    if (press.timer !== null) {
      window.clearTimeout(press.timer)
      press.timer = null
    }
    longPressState.value = null
  }
  if (!draggingAnnotationId.value) return
  ev.preventDefault()
  const point = getAnnotationPoint(touch.clientX, touch.clientY)
  if (!point) return
  hasDragged.value = true
  emit('move-annotation', {
    id: draggingAnnotationId.value,
    x: point.x,
    y: point.y,
    ...(Number.isFinite(point.page) ? { page: point.page } : {}),
  })
}

function onWindowTouchEnd(ev: TouchEvent) {
  if (activeTouchId.value === null) return
  const ended = Array.from(ev.changedTouches).some((item) => item.identifier === activeTouchId.value)
  if (!ended) return
  const press = longPressState.value
  if (press && press.timer !== null) {
    window.clearTimeout(press.timer)
  }
  if (press?.triggered) {
    hasDragged.value = true
  }
  activeTouchId.value = null
  longPressState.value = null
  draggingAnnotationId.value = null
}

onMounted(() => {
  const viewport = viewportRef.value
  if (viewport) {
    viewport.addEventListener('wheel', onViewportWheel, { passive: false })
  }
  window.addEventListener('pointermove', onWindowPointerMove, { passive: true })
  window.addEventListener('pointerup', onWindowPointerUp, { passive: true })
  window.addEventListener('pointercancel', onWindowPointerUp, { passive: true })
  window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
  window.addEventListener('touchend', onWindowTouchEnd, { passive: true })
  window.addEventListener('touchcancel', onWindowTouchEnd, { passive: true })
  window.addEventListener('resize', onWindowResize, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    scrollResizeObserver = new ResizeObserver(() => {
      bumpLayoutVersion()
    })
    if (innerRef.value) {
      scrollResizeObserver.observe(innerRef.value)
    }
  }
  void nextTick(() => {
    bumpLayoutVersion()
  })
})

onBeforeUnmount(() => {
  const press = longPressState.value
  if (press && press.timer !== null) {
    window.clearTimeout(press.timer)
  }
  if (scrollResizeObserver) {
    scrollResizeObserver.disconnect()
    scrollResizeObserver = null
  }
  const viewport = viewportRef.value
  if (viewport) {
    viewport.removeEventListener('wheel', onViewportWheel)
  }
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('pointercancel', onWindowPointerUp)
  window.removeEventListener('touchmove', onWindowTouchMove)
  window.removeEventListener('touchend', onWindowTouchEnd)
  window.removeEventListener('touchcancel', onWindowTouchEnd)
  window.removeEventListener('resize', onWindowResize)
})

watch(
  () => props.svgHtml,
  () => {
    scale.value = 1
    unlockViewportMetrics()
    endPan()
    const viewport = viewportRef.value
    if (!viewport) return
    viewport.scrollLeft = 0
    viewport.scrollTop = 0
    void nextTick(() => {
      bumpLayoutVersion()
      decoratePlaybackHitElements(innerRef.value)
    })
  },
)

watch(
  () => props.playbackHitElementIds,
  () => {
    void nextTick(() => {
      decoratePlaybackHitElements(innerRef.value)
    })
  },
  { deep: true },
)

watch(
  [() => props.scrollMode, () => props.showAnnotations, () => props.annotations, () => scale.value],
  () => {
    void nextTick(() => {
      bumpLayoutVersion()
    })
  },
  { deep: true },
)

watch(
  () => scale.value,
  (value) => {
    emit('zoom-state-change', { zoomed: value > SCALE_UNIT + 0.001 })
  },
  { immediate: true },
)
</script>

<style scoped>
.score-pinch-viewport {
  width: 100%;
  min-height: min(60vh, 520px);
  overflow: auto;
  border-radius: 8px;
  background: var(--ion-background-color);
  touch-action: pan-x pan-y;
  -webkit-overflow-scrolling: touch;
}

.score-pinch-viewport--zoomed {
  touch-action: none;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.score-pinch-viewport--zoomed:active {
  cursor: grabbing;
}

.score-pinch-spacer {
  position: relative;
}

.score-pinch-inner {
  width: 100%;
  position: relative;
}

.score-svg-layer {
  width: 100%;
}

.score-pinch-inner :deep(svg) {
  display: block;
  width: 100% !important;
  max-width: 100% !important;
  height: auto;
  margin: 0;
}

/* 滚动模式：多页拼接时的页间距（由 HomePage 注入 class） */
.score-pinch-inner :deep(.score-scroll-page-block) {
  width: 100%;
  margin-bottom: 16px;
  /* Verovio 在页边界附近可能有少量超出，避免在滚动拼接模式被块容器裁切。 */
  overflow: visible;
}

.score-pinch-inner :deep(.score-scroll-page-block:last-child) {
  margin-bottom: 0;
}

.score-annotation {
  position: absolute;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid currentColor;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.2;
  user-select: none;
  touch-action: none;
  cursor: move;
  z-index: 5;
}

.score-annotation-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.score-annotation:hover {
  outline: 2px solid currentColor;
}

:deep([data-playback-hit="true"]) {
  fill: #3b82f6 !important;
  stroke: #3b82f6 !important;
  filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.6));
}

:deep(.playback-hit-element) {
  fill: #3b82f6 !important;
  stroke: #3b82f6 !important;
  filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.6));
}

/* 点击乐符高亮蓝色（--color-playback #3b82f6），用于验证点击命中精度 */
:deep(.note-click-highlight) {
  fill: #3b82f6 !important;
  stroke: #3b82f6 !important;
  filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.85));
}
</style>
