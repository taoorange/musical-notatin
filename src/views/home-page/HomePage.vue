<template>
  <ion-page
    class="home-page"
    :class="{ 'home-page--score-file-drag': scoreFileDropOverlayVisible }"
    @dragenter.capture="onScoreFileDragEnter"
    @dragleave.capture="onScoreFileDragLeave"
    @dragover.capture="onScoreFileDragOver"
    @drop.capture="onScoreFileDrop"
  >
    <!-- 页头 -->
    <AppHeader
      :score-chrome-visible="scoreChromeVisible"
      :can-toggle-score-chrome="canToggleScoreChrome"
      :effective-score-theme-mode="effectiveScoreThemeMode"
      :file-tool-panel-expanded="fileToolPanelExpanded"
      :loading="loading"
      :file-name="fileName"
      :pages-svg-length="pagesSvg.length"
      :error="error"
      :orchestra-playback-loading="orchestraPlaybackLoading"
      :orchestra-playback-ready="orchestraPlaybackReady"
      :orchestra-playing="orchestraPlaying"
      :can-export-annotated-music-xml="canExportAnnotatedMusicXml"
      :annotation-panel-expanded="annotationPanelExpanded"
      :annotation-mode="annotationMode"
      @toggle-file-tool="toggleFileToolPanel"
      @open-instructions="openInstructionsForUse"
      @toggle-playback="orchestraPlaying ? pauseOrchestra() : playOrchestra()"
      @export-annotated-musicxml="exportAnnotatedMusicXml"
      @toggle-annotation="toggleAnnotationPanel"
      @refresh-page="refreshPage"
    />

    <!-- 乐谱渲染 + 文件工具 + 标注工具 -->
    <ion-content
      ref="scoreContentRef"
      :fullscreen="true"
      :scroll-y="!pageViewportZoomed"
      class="score-scroll"
      :class="{
        'score-scroll--immersive': !scoreChromeVisible && canToggleScoreChrome,
        'score-scroll--chrome-padding': scoreChromeVisible && pagesSvg.length > 0,
      }"
    >
      <input
        ref="fileInputRef"
        type="file"
        :accept="SCORE_FILE_ACCEPT"
        class="visually-hidden"
        @change="onFileChange"
      />

      <!-- 文件工具 -->
      <FileToolPanel
        :style="annotationPanelHeightStyle"
        v-model:view-mode="viewMode"
        :expanded="fileToolPanelExpanded"
        :loading="loading"
        :score-ready="pagesSvg.length > 0 && !error"
        :filtered-cached-files="filteredCachedFiles"
        :selected-cache-key="selectedCacheKey"
        :render-engine="renderEngine"
        :osmd-manual-page-width-tenths="osmdManualPageWidthTenths"
        :osmd-manual-page-height-tenths="osmdManualPageHeightTenths"
        :osmd-scaling-source-xml="osmdScalingSourceXml"
        :osmd-orchestral-one-system-layout="osmdOrchestralOneSystemLayout"
        :verovio-page-width="verovioPageWidth"
        :verovio-show-header="verovioShowHeader"
        :verovio-show-footer="verovioShowFooter"
        :score-theme-mode="effectiveScoreThemeMode"
        :page-turn-sound-enabled="pageTurnSoundEnabled"
        :scroll-playback-auto-follow-enabled="scrollPlaybackAutoFollowEnabled"
        :playback-ready="orchestraPlaybackReady"
        :playback-loading="orchestraPlaybackLoading"
        :playback-playing="orchestraPlaying"
        :playback-source-hint="orchestraSoundfontSourceHint"
        @cached-file-select="onCachedFileSelect"
        @render-engine-select="onRenderEngineSelect"
        @update:osmd-use-file-page-dimensions="onOsmdUseFilePageDimensionsChange"
        @update:osmd-manual-page-width-tenths="onOsmdManualPageWidthTenthsChange"
        @update:osmd-manual-page-height-tenths="onOsmdManualPageHeightTenthsChange"
        @update:verovio-page-width="onVerovioPageWidthChange"
        @update:verovio-show-header="onVerovioShowHeaderChange"
        @update:verovio-show-footer="onVerovioShowFooterChange"
        @toggle-score-theme-mode="toggleScoreThemeMode"
        @apply-osmd-layout="applyOsmdLayoutToCurrentScore"
        @apply-verovio-layout="applyVerovioLayoutToCurrentScore"
        @trigger-pick="triggerPick"
        @toggle-page-turn-sound="togglePageTurnSound"
        @toggle-scroll-playback-auto-follow="toggleScrollPlaybackAutoFollow"
        @prepare-orchestra-playback="prepareOrchestraPlayback"
        @play-orchestra="playOrchestra"
        @pause-orchestra="pauseOrchestra"
        @stop-orchestra="stopOrchestra"
        @delete-current-cache="onDeleteCurrentCache"
        @delete-cached-file="onDeleteCachedFile"
        @refresh-page="refreshPage"
      />

      <!-- 翻页乐谱渲染 -->
      <div
        v-if="pagesSvg.length && viewMode === 'page'"
        ref="pageSwipeHostRef"
        class="score-pages score-pages--page"
        :class="{ 'score-pages--annotation-space-reserved': shouldReserveAnnotationPanelSpace }"
        @click="onScoreSurfaceClickDismissFileTools"
        @touchstart="onPageSwipeStart"
        @touchmove="onPageSwipeMove"
        @touchend="onPageSwipeEnd"
        @touchcancel="onPageSwipeCancel"
      >
        <ScorePinchViewport
          :key="`page-${currentPage}`"
          :svg-html="pagesSvg[currentPage - 1]"
          :annotations="currentPageAnnotations"
          :show-annotations="annotationsVisible"
          :annotation-enabled="annotationMode && canAnnotateInFileFormat && annotationsVisible"
          :playback-hit-element-ids="currentPlaybackHitElementIds"
          @viewport-activity="onViewportActivity"
          @zoom-state-change="onPageViewportZoomStateChange"
          @add-annotation="onAddAnnotation"
          @move-annotation="onMoveAnnotation"
          @remove-annotation="onRemoveAnnotation"
          @note-click="onNoteClick"
        />
        <!-- 播放指示线：显示当前页内的横向播放位置。 -->
        <div
          v-show="playbackIndicatorVisible && (orchestraPlaying || orchestraPlaybackPaused) && !orchestraNotePreviewActive"
          class="playback-indicator-line"
          :style="playbackIndicatorLineStyle"
        >
          <!-- 调试模式：在线旁显示页内播放百分比（0~100%）。 -->
          <span
            v-if="orchestraAlignmentDebugUiEnabled"
            class="playback-indicator-percent"
          >
            {{ playbackIndicatorPercentText }}
          </span>
        </div>
        <!-- 调试模式：左上角显示 tick 进度（当前 tick / 总 tick）。 -->
        <div
          v-if="orchestraAlignmentDebugUiEnabled && pagesSvg.length > 0"
          class="playback-debug-ticks"
        >
          {{ playbackTickText }}
        </div>
        <!-- 调试模式：发生自动翻页时短暂闪现页码跳转提示。 -->
        <div
          v-if="orchestraAlignmentDebugUiEnabled && pageFlipFlashVisible"
          class="page-flip-flash"
        >
          {{ pageFlipFlashText }}
        </div>
        <canvas ref="pageSwipeCanvasRef" class="swipe-spark-canvas" />
      </div>


      <!-- 滚动乐谱渲染 -->
      <div
        v-if="pagesSvg.length && viewMode === 'scroll'"
        ref="scrollHostRef"
        class="score-pages score-pages--scroll"
        :class="{ 'score-pages--annotation-space-reserved': shouldReserveAnnotationPanelSpace }"
        @click="onScoreSurfaceClickDismissFileTools"
      >
        <ScorePinchViewport
          key="scroll-all"
          :svg-html="scrollCombinedHtml"
          :annotations="annotationsForViewport"
          :show-annotations="annotationsVisible"
          :annotation-enabled="annotationMode && canAnnotateInFileFormat && annotationsVisible"
          :scroll-mode="true"
          :playback-hit-element-ids="currentPlaybackHitElementIds"
          @viewport-activity="onViewportActivity"
          @zoom-state-change="onPageViewportZoomStateChange"
          @add-annotation="onAddAnnotation"
          @move-annotation="onMoveAnnotation"
          @remove-annotation="onRemoveAnnotation"
          @note-click="onNoteClick"
        />
        <!-- 调试模式：播放指示线：显示当前页内的横向播放位置。 -->
        <div
          v-show="playbackIndicatorVisible && (orchestraPlaying || orchestraPlaybackPaused) && !orchestraNotePreviewActive"
          class="playback-indicator-line"
          :style="playbackIndicatorLineStyle"
        >
          <span
            v-if="orchestraAlignmentDebugUiEnabled"
            class="playback-indicator-percent"
          >
            {{ playbackIndicatorPercentText }}
          </span>
        </div>
        <!-- 调试模式：左上角显示 tick 进度（当前 tick / 总 tick）。 -->
        <div
          v-if="orchestraAlignmentDebugUiEnabled && pagesSvg.length > 0"
          class="playback-debug-ticks"
        >
          {{ playbackTickText }}
        </div>
      </div>
      <div
        v-if="
          orchestraAlignmentDebugUiEnabled &&
          viewMode === 'scroll' &&
          pagesSvg.length > 0 &&
          (orchestraPlaying || orchestraPlaybackPaused)
        "
        class="playback-scroll-fixed-debug"
      >
        <span class="playback-scroll-fixed-debug-chip">{{ playbackIndicatorPercentText }}</span>
        <span class="playback-scroll-fixed-debug-chip">{{ playbackTickText }}</span>
      </div>

      <!-- 标注工具 -->
      <AnnotationToolPanel
        :style="annotationPanelHeightStyle"
        :visible="pagesSvg.length > 0"
        :expanded="annotationPanelExpanded"
        :loading="loading"
        :annotation-mode="annotationMode"
        :annotations-visible="annotationsVisible"
        :annotations-count="annotations.length"
        :annotation-draft-text="annotationDraftText"
        :annotation-color="annotationColor"
        :selected-annotation-shortcut="selectedAnnotationShortcut"
        :can-annotate-in-file-format="canAnnotateInFileFormat"
        :can-export-annotated-music-xml="canExportAnnotatedMusicXml"
        :is-scroll-view="viewMode === 'scroll'"
        @toggle-annotation-mode="scoreUiStore.toggleAnnotationMode()"
        @toggle-annotations-visible="scoreUiStore.toggleAnnotationsVisible()"
        @update:annotation-draft-text="onAnnotationDraftTextChange"
        @update:annotation-color="annotationColor = $event"
        @update:selected-annotation-shortcut="scoreUiStore.setSelectedAnnotationShortcut($event)"
        @clear-annotations="clearAnnotationsByViewMode"
        @export-annotated-musicxml="exportAnnotatedMusicXml"
      />
    </ion-content>

    <!-- footer翻页导航 -->
    <PagePagerFooter
      v-if="pagesSvg.length && viewMode === 'page'"
      :class="{
        'score-chrome-hidden score-chrome-hidden--footer': !scoreChromeVisible && canToggleScoreChrome,
      }"
      :current-page="currentPage"
      :total-pages="totalPages"
      :page-draft="pageDraft"
      @prev="goPrev"
      @next="goNext"
      @update:page-draft="onPageDraftInput"
      @commit-page-jump="commitPageJump"
    />

    <!-- 加载中提示 -->
    <MusicScoreLoading :visible="loading" :loading-stage-index="scoreLoadingStageIndex" />

    <!-- 拖入乐谱文件时的全屏提示（不拦截指针，drop 仍落到下层） -->
    <Teleport to="body">
      <Transition name="score-file-drop-fade">
        <div
          v-if="scoreFileDropOverlayVisible && !loading"
          class="score-file-drop-overlay"
          role="status"
          aria-live="polite"
        >
          <div class="score-file-drop-overlay__veil" aria-hidden="true" />
          <div class="score-file-drop-overlay__frame" aria-hidden="true" />
          <div class="score-file-drop-overlay__card">
            <p class="score-file-drop-overlay__title">松开即可打开乐谱</p>
            <p class="score-file-drop-overlay__sub">将 .musicxml、.mxl 或 .mei 拖入此区域后释放即可读取</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认 -->
    <ion-alert
      :is-open="deleteConfirmOpen"
      header="确认删除"
      :message="deleteConfirmMessage"
      :buttons="deleteConfirmButtons"
      @didDismiss="deleteConfirmOpen = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonAlert,
  IonContent,
  IonPage,
} from '@ionic/vue'
import MusicScoreLoading from '@/components/MusicScoreLoading.vue'
import ScorePinchViewport from '@/components/ScorePinchViewport.vue'
import FileToolPanel from '@/views/home-page/components/FileToolPanel.vue'
import AnnotationToolPanel from '@/views/home-page/components/AnnotationToolPanel.vue'
import PagePagerFooter from '@/views/home-page/components/PagePagerFooter.vue'
import AppHeader from '@/views/home-page/components/AppHeader.vue'
import {
  buildScoreCacheKey,
  clearAllScoreCache,
  clearLastOpenedCacheKey,
  getFileSha256Hex,
  getLastOpenedCacheKey,
  listScoreCacheSummaries,
  getScoreCache,
  removeScoreCache,
  getScoreCacheMidiSnapshot,
  normalizeOsmdPageMeasureInkNormSpans,
  normalizeScoreCacheMidiFields,
  pruneScoreCache,
  putScoreCache,
  setLastOpenedCacheKey,
  type ScoreAnnotationRecord,
  type ScoreCacheMidiSnapshot,
  type ScoreCacheRecord,
  type ScoreCacheSummary,
  type ScoreViewMode,
} from '@/lib/scoreCache'
import { VEROVIO_LAYOUT_CACHE_VERSION } from '@/lib/verovio'
import { mxlToMusicXmlString } from '@/lib/mxl'
import {
  renderMusicXmlWithOsmdPages,
  extractMusicXmlPageLayout,
  mergeOsmdPageFormatOptions,
  resolveOsmdLayoutHostWidthPx,
  patchMusicXmlPageLayoutTenths,
  pageLayoutTenthsToMm,
  planOrchestralOneSystemPageLayout,
  type OsmdOrchestralOneSystemLayoutInfo,
} from '@/lib/osmd'
import { DEFAULT_ORCHESTRA_SOUNDFONT_URL, OrchestraPlayer } from '@/lib/orchestraPlayer'
import {
  clampPlaybackProgress,
  getMidiTotalTicksFromBase64,
  mapProgressToPagePosition,
  mapProgressToPagePositionAccurate,
} from '@/lib/playbackCursor'
import {
  captureOsmdMeasureLayoutForAnchor,
  measureLayoutFieldsFromFraction,
  projectOsmdAnnotationToContainer,
  realignOsmdAnnotationsAfterLayoutChange,
  resolveRendererPageForMeasure,
  snapshotOsmdAnnotationMeasureInkFractions,
  type MeasureInkFraction,
} from '@/lib/annotationLayoutSync'
import {
  attachInkHorizontalRangesToSystems,
  mapInkNormXToHostLeftRatio,
  mapContainerNormXYToInkNormXY,
  mapInkNormXYToContainerNormXY,
  measurePageMusicInkClientRect,
  measurePlaybackSystemsLayout,
  measurePlaybackStaffHorizontalRange,
  shouldSplitSingleSystemPlaybackLayout,
  type PageMusicInkClientRect,
  type PlaybackSystemLayout,
} from '@/lib/playbackStaffLayout'
import { interpolatePlaybackIndicatorByTimedEntries } from '@/lib/playbackIndicatorInterpolator'
import {
  millisecondsToTickLinear,
  parseMidiTempoMap,
  ticksToMilliseconds,
  type MidiTempoMap,
} from '@/lib/midiTempo'
import { findNotationXmlIdUnderPoint } from '@/lib/notationHit'
import { resolveVerovioElementStartMs } from '@/lib/verovioAnnotationAnchor'
import {
  resolveViewportAnnotationAnchorOnScoreXml,
  type OsmdInkNormMeasureSpan,
  type OsmdMusicSystemNormBounds,
  type RendererPageMeasureBounds,
} from '@/lib/musicXmlNoteAnchors'
import {
  buildSemanticPlaybackRows,
  mapTickToSemanticPlayback,
  type SemanticPlaybackRow,
} from '@/lib/musicXmlSemanticPlayback'
import {
  resolveOsmdPlaybackCursorHit,
  resolveOsmdSystemProgressFromInk,
  type OsmdPlaybackCursorHit,
} from '@/lib/osmdPlaybackCursor'
import {
  buildPlaybackElementIndexFromSvg,
  type PlaybackElementIndex,
  type PlaybackElementIndexEntry,
} from '@/lib/verovio'
import pageTurningAudioUrl from '@/assets/audio/page-turning.mp3'
import {
  formatAnnotationText,
  getInstrumentAnnotationIcon,
  isInstrumentAnnotationShortcut,
} from '@/lib/instrumentAnnotations'
import {
  normalizeAnnotationRecords,
  parseFiveLineStaffUiComment,
  parseScoreAnnotationsFromMusicXml,
  stripAnnotationArtifacts,
  withEmbeddedAnnotations,
  type ParsedEmbeddedAnnotations,
} from '@/lib/musicXmlAnnotations'
import { annotationDebugLog } from '@/lib/annotationDebug'
import { createOrchestraPerfTimer } from '@/lib/orchestraPerf'
import { storeToRefs } from 'pinia'
import { useScoreUiStore, type ScoreRenderEngine } from '@/stores/scoreUi'
import { dateFormat } from '@/lib/utils'

const router = useRouter()
const fileInputRef = ref<HTMLInputElement | null>(null)
const scoreContentRef = ref<InstanceType<typeof IonContent> | HTMLElement | null>(null)
const scoreUiStore = useScoreUiStore()
const {
  annotationMode,
  annotationsVisible,
  annotationDraftText,
  annotationColor,
  selectedAnnotationShortcut,
  verovioPageWidth,
  osmdPageWidth,
  osmdManualPageWidthTenths,
  osmdManualPageHeightTenths,
  verovioShowHeader,
  verovioShowFooter,
} = storeToRefs(scoreUiStore)
/** 无当前引擎下的缓存时默认展开文件工具；有缓存时默认收起；仅首屏与列表在「空↔非空」之间变化时自动同步。 */
const fileToolPanelExpanded = ref(false)
let lastFilteredCachedFilesCount = -1
const annotationPanelExpanded = ref(false)
const loading = ref(false)
/** 与 MusicScoreLoading 阶段文案同步；未设时加载层使用定时轮换（主线程长时间同步任务会卡住定时器） */
const scoreLoadingStageIndex = ref<number | undefined>(undefined)
/** 有本地文件拖入本页时显示全屏提示（松手打开）。 */
const scoreFileDropOverlayVisible = ref(false)
const error = ref('')
const pagesSvg = ref<string[]>([])
/** OSMD 分页下每页对应首声部 `<measure>` 的 0-based 闭区间（与 `renderMusicXmlWithOsmdPages` 一致）；Verovio 为空数组 */
const osmdPageMeasureIndexBounds = ref<RendererPageMeasureBounds[]>([])
/** OSMD：引擎小节水平几何归一化到墨迹宽度（与 `ann.x` 一致）；Verovio 或未生成时为空数组 */
const osmdPageMeasureInkNormSpans = ref<OsmdInkNormMeasureSpan[][]>([])
/** OSMD：每页各 MusicSystem 墨迹归一化纵向范围（播放指示线按连谱行高） */
const osmdPageMusicSystemNormBounds = ref<OsmdMusicSystemNormBounds[][]>([])
/** 缓存每页在 DOM 中的墨迹区 client rect，翻页模式下测量当前页后缓存，供跨页标注投影时使用。*/
const pageInkClientRects = ref<(PageMusicInkClientRect | null)[]>([])
/** 大编制总谱「一页一个 system」自动页高优化状态（用于提示与缓存版本） */
const osmdOrchestralOneSystemLayout = ref<OsmdOrchestralOneSystemLayoutInfo | null>(null)
const fileName = ref('')
const selectedCacheKey = ref('')
const cachedFiles = ref<ScoreCacheSummary[]>([])
const deleteConfirmOpen = ref(false)
const currentPage = ref(1)
const currentLayoutVersion = ref('')
const currentScoreXmlForExport = ref('')
const currentSourceFormat = ref<'musicxml' | 'mxl' | 'mei' | 'unknown'>('unknown')
const annotations = ref<ScoreAnnotationRecord[]>([])
/** 当前谱是否来自含 `five-line-staff-ui` 注释的 MusicXML（导出再开或缓存恢复）；用于 OSMD「应用排版」前警告 */
const scoreOpenedWithFlsUiComment = ref(false)
const pageTurnAudioRef = ref<HTMLAudioElement | null>(null)
const pageTurnSoundEnabled = ref(false)
const scrollPlaybackAutoFollowEnabled = computed(() => scoreUiStore.scrollPlaybackAutoFollowEnabled)
const orchestraPlaybackLoading = ref(false)
const orchestraPlaybackReady = ref(false)
const orchestraPlaying = ref(false)
/** 用户暂停后保持指示线可见，直到再次播放或停止 */
const orchestraPlaybackPaused = ref(false)
/** 点击乐符短播预览中：不展示播放指示线、不跑 cursor 轮询 */
const orchestraNotePreviewActive = ref(false)
const orchestraSoundfontSourceHint = ref('未准备')
const currentMidiBase64 = ref('')
const orchestraSoundFontUrl = ref(
  (import.meta.env.VITE_ORCHESTRA_SOUNDFONT_URL as string | undefined)?.trim() ||
    DEFAULT_ORCHESTRA_SOUNDFONT_URL,
)
const currentVerovioSourceXml = ref('')
const currentMidiTotalTicks = ref(0)
/** 当前乐谱 MIDI 的总时长（毫秒），用于把 tick 映射到 Verovio timemap 的时间轴 */
const currentMidiTotalMs = ref(0)
const scoreChromeVisible = ref(true)
const manualScoreThemeMode = ref<'light' | 'dark'>('light')
let persistCacheTimer: number | null = null
/** 输入框中的页码草稿，与 currentPage 同步；在 blur / Enter 时提交 */
const pageDraft = ref('1')
/** 翻页：单页 + 底栏；滚动：纵向连续多页；通过 Pinia 持久化 */
const viewMode = computed<'page' | 'scroll'>({
  get: () => scoreUiStore.viewMode,
  set: (mode) => scoreUiStore.setViewMode(mode),
})
/** 渲染引擎：Verovio / OpenSheetMusicDisplay；通过 Pinia 持久化 */
const renderEngine = computed<ScoreRenderEngine>({
  get: () => scoreUiStore.renderEngine,
  set: (engine) => scoreUiStore.setRenderEngine(engine),
})

/** .mxl / .musicxml / .mei（Verovio 均支持） */
const SCORE_FILE_ACCEPT = '.mxl,.musicxml,.mei'

const totalPages = computed(() => pagesSvg.value.length)
const canToggleScoreChrome = computed(
  () => pagesSvg.value.length > 0 && !annotationMode.value && !loading.value,
)
const immersiveScoreMode = computed(() => !scoreChromeVisible.value && canToggleScoreChrome.value)
const landscapeViewport = ref(false)
const shouldReserveAnnotationPanelSpace = computed(
  () => annotationPanelExpanded.value && landscapeViewport.value && pagesSvg.value.length > 0,
)

/** 标注侧栏 max-height：100dvh 减去顶栏/底栏（与 ion-content 预留 52px 一致），沉浸式时底栏不占位 */
const annotationPanelHeightStyle = computed(() => {
  const top = 'var(--ion-safe-area-top, 0px)'
  const bottom = 'var(--ion-safe-area-bottom, 0px)'
  if (immersiveScoreMode.value) {
    return { '--annotation-panel-height-subtract': `calc(${top} + 52px + ${bottom} + 12px)` }
  }
  return { '--annotation-panel-height-subtract': `calc(${top} + 52px + ${bottom} + 52px + 12px)` }
})
const deleteConfirmMessage = computed(() => '确定清空所有本地缓存乐谱吗？')

/** 当前乐谱源 XML，供侧栏 tenths→mm 换算与手动排版预览 */
const osmdScalingSourceXml = computed(
  () => (currentVerovioSourceXml.value || currentScoreXmlForExport.value).trim(),
)

function syncOsmdManualPageDimensionsFromXml(
  xml: string,
  orchestralLayout?: OsmdOrchestralOneSystemLayoutInfo | null,
) {
  const layout = extractMusicXmlPageLayout(xml)
  if (!layout) return
  scoreUiStore.setOsmdManualPageWidthTenths(layout.widthTenths)
  const heightTenths =
    orchestralLayout?.applied === true
      ? orchestralLayout.adjustedHeightTenths
      : layout.heightTenths
  scoreUiStore.setOsmdManualPageHeightTenths(heightTenths)
}

function applyOsmdOrchestralLayoutState(
  layout: OsmdOrchestralOneSystemLayoutInfo | null | undefined,
) {
  osmdOrchestralOneSystemLayout.value = layout?.applied ? layout : null
}

/** 打开/缓存键：按文件 tenths 同步侧栏，并预计算大编制「一页一 system」页高。 */
function prepareOsmdPageLayoutStateForXml(xml: string) {
  applyOsmdOrchestralLayoutState(null)
  syncOsmdManualPageDimensionsFromXml(xml)
  if (renderEngine.value !== 'osmd') return
  const preview = planOrchestralOneSystemPageLayout(xml, {
    paged: true,
    preferOneSystemPerPage: true,
  })
  if (preview) {
    applyOsmdOrchestralLayoutState(preview.meta)
    syncOsmdManualPageDimensionsFromXml(xml, preview.meta)
  }
}

function restoreOsmdOrchestralLayoutHintFromCache(xml: string, layoutVersion: string) {
  if (!layoutVersion.includes('-orch1sys')) {
    applyOsmdOrchestralLayoutState(null)
    syncOsmdManualPageDimensionsFromXml(xml)
    return
  }
  const preview = planOrchestralOneSystemPageLayout(xml, {
    paged: true,
    preferOneSystemPerPage: true,
  })
  applyOsmdOrchestralLayoutState(preview?.meta ?? null)
  syncOsmdManualPageDimensionsFromXml(xml, preview?.meta ?? null)
}

const filteredCachedFiles = computed(() =>
  cachedFiles.value.filter((item) => isCacheKeyForEngine(item.cacheKey, renderEngine.value)),
)
const effectiveScoreThemeMode = computed<'light' | 'dark'>(() => manualScoreThemeMode.value)
/** Verovio `inkColor` / OSMD 默认墨迹色的共用取值 */
const scoreInkColor = computed(() => (effectiveScoreThemeMode.value === 'dark' ? '#ffffff' : '#000000'))

const blurActiveElement = () => {
  const active = document.activeElement
  if (active instanceof HTMLElement) {
    active.blur()
  }
}

const openInstructionsForUse = () => {
  blurActiveElement()
  void router.push('/instructions-for-use')
}

watch(
  () => filteredCachedFiles.value.length,
  (len) => {
    if (lastFilteredCachedFilesCount === -1) {
      fileToolPanelExpanded.value = len === 0
      lastFilteredCachedFilesCount = len
      return
    }
    if (len === 0 && lastFilteredCachedFilesCount > 0) {
      fileToolPanelExpanded.value = true
    } else if (len > 0 && lastFilteredCachedFilesCount === 0) {
      fileToolPanelExpanded.value = false
    }
    lastFilteredCachedFilesCount = len
  },
  { immediate: true },
)

/** OSMD 标注屏上坐标由锚定小节 + 当前 ink span 投影；随窗口缩放递增以重读 DOM 墨迹区。 */
const annotationLayoutEpoch = ref(0)
function bumpAnnotationLayoutEpoch() {
  annotationLayoutEpoch.value += 1
}

/** 测量当前页 DOM 墨迹区 client rect 并缓存。页面 SVG 挂载后调用。 */
function cacheCurrentPageInkRect() {
  if (viewMode.value !== 'page') return
  const pg = currentPage.value
  if (pg < 1 || pg > pagesSvg.value.length) return
  const root = getScoreAnnotationHitTestRoot()
  const inner = root?.querySelector<HTMLElement>('.score-pinch-inner') ?? null
  if (!inner) return
  const svg =
    inner.querySelector<SVGSVGElement>('.score-svg-layer svg') ??
    inner.querySelector<SVGSVGElement>('svg')
  const ink = measurePageMusicInkClientRect(inner, svg)
  if (!ink) return
  const rects = pageInkClientRects.value
  while (rects.length < pagesSvg.value.length) rects.push(null)
  rects[pg - 1] = ink
}

const annotationsForViewport = computed(() => {
  void annotationLayoutEpoch.value
  if (renderEngine.value !== 'osmd') return annotations.value
  const bounds = osmdPageMeasureIndexBounds.value
  const spans = osmdPageMeasureInkNormSpans.value
  if (!bounds.length || spans.length !== bounds.length) return annotations.value

  const root = getScoreAnnotationHitTestRoot()
  const inner = root?.querySelector<HTMLElement>('.score-pinch-inner') ?? null
  const containerRect = inner?.getBoundingClientRect() ?? null

  return annotations.value.map((ann) => {
    if (ann.anchorMeasureListIndex0 == null || ann.anchorMeasureListIndex0 < 0) return ann

    const resolvedPage =
      resolveRendererPageForMeasure(ann.anchorMeasureListIndex0, bounds) ?? ann.page
    const cachedInk = pageInkClientRects.value[resolvedPage - 1] ?? null

    const projected = projectOsmdAnnotationToContainer(ann, bounds, spans, {
      inkToContainer: (inkX, inkY, _page) => {
        let ink: PageMusicInkClientRect | null = cachedInk
        if (!ink && resolvedPage === currentPage.value) {
          const svg =
            inner?.querySelector<SVGSVGElement>('.score-svg-layer svg') ??
            inner?.querySelector<SVGSVGElement>('svg') ??
            null
          ink = measurePageMusicInkClientRect(inner, svg)
        }
        if (!ink || !containerRect || containerRect.width <= 1 || containerRect.height <= 1)
          return null
        return mapInkNormXYToContainerNormXY(inkX, inkY, ink, containerRect)
      },
      containerToInk: containerNormXYToInkNormForAnnotation,
    })
    if (!projected) return ann
    return { ...ann, page: projected.page, x: projected.x, y: projected.y }
  })
})

const currentPageAnnotations = computed(() =>
  annotationsForViewport.value.filter((item) => item.page === currentPage.value),
)
const canAnnotateInFileFormat = computed(
  () => currentSourceFormat.value === 'musicxml' || currentSourceFormat.value === 'mxl',
)
const canExportAnnotatedMusicXml = computed(
  () => canAnnotateInFileFormat.value && currentScoreXmlForExport.value.length > 0,
)
const isiPad = ref(false)
const swipeActive = ref(false)
const swipeLock = ref<'none' | 'horizontal' | 'vertical'>('none')
const swipeStartX = ref(0)
const swipeStartY = ref(0)
const swipeDeltaX = ref(0)
const swipeDeltaY = ref(0)
const pageSwipeHostRef = ref<HTMLDivElement | null>(null)
const scrollHostRef = ref<HTMLDivElement | null>(null)
const pageSwipeCanvasRef = ref<HTMLCanvasElement | null>(null)
const swipeLastTouchX = ref(0)
const swipeLastTouchY = ref(0)
const swipeLastTouchTime = ref(0)
const SWIPE_LOCK_THRESHOLD_PX = 12
const SWIPE_TRIGGER_PX = 72
const SPARK_EMIT_INTERVAL_MS = 8
/** 高饱和霓虹色相锚点（红/橙/绿/青/紫/品红），抖动后仍偏鲜艳。 */
const SWIPE_SPARK_HUE_ANCHORS = [0, 28, 125, 195, 280, 310]
const pageViewportZoomed = ref(false)

interface SwipeSparkParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  hue: number
  saturation: number
  lightness: number
}

let swipeSparkParticles: SwipeSparkParticle[] = []
let swipeSparkRafId: number | null = null
let swipeSparkLastFrameAt = 0
let swipeSparkLastEmitAt = 0
let playbackCursorRafId: number | null = null
/** 指示线横向缓动：与 updatePlaybackCursor 解耦，保证约 60fps 视觉插值 */
let playbackIndicatorVisualRafId: number | null = null
let playbackDebugLastLogAt = 0
let playbackIndicatorScrollMeasuredPage = 0
let cachedScoreScrollElement: HTMLElement | null = null
/** 滚动模式播放：用户手动滚动后暂停自动跟随时长（毫秒）。 */
const SCROLL_PLAYBACK_FOLLOW_RESUME_MS = 10_000
/** 与程序 scrollTop 差值小于该阈值时视为自动滚动触发的 scroll 事件。 */
const SCROLL_PLAYBACK_FOLLOW_PROGRAMMATIC_EPS_PX = 6
let scrollPlaybackFollowPaused = false
let scrollPlaybackFollowResumeTimer: number | null = null
/** 上一帧程序设置的 scrollTop，用于 scroll 事件里区分用户滚动。 */
let lastProgrammaticScrollTop: number | null = null
let scoreScrollPlaybackFollowListenerEl: HTMLElement | null = null
let windowScrollPlaybackFollowListenersAttached = false
let scoreScrollFollowTouchStartY = 0
let scoreScrollFollowTouchTracking = false
// 调试总开关：控制台日志与播放对齐调试 UI 都使用同一变量。
const orchestraDebugEnabled =
  String(import.meta.env.VITE_ORCHESTRA_DEBUG_CONSOLE ?? '')
    .trim()
    .toLowerCase() === 'true'

function orchestraDebugLog(level: 'log' | 'info' | 'warn', message: string, payload: unknown) {
  if (!orchestraDebugEnabled) return
  if (level === 'warn') {
    console.log(message, payload)
    return
  }
  console[level](message, payload)
}
/** 每页结束时的归一化播放进度边界值 [0, 1]，由 Verovio renderToTimemap 提取 */
const playbackPageBoundaries = ref<number[]>([])
/** 每页内各 system 的结束边界（页内归一化 [0,1]），用于在 system 换行点重置指示线 */
const playbackSystemBoundariesByPage = ref<number[][]>([])
/** MusicXML 语义播放表：播放阶段优先查表，避免运行时临时解析抖动 */
const playbackSemanticRows = ref<SemanticPlaybackRow[]>([])
/** 播放高亮专用的 Verovio toolkit（存活于整个播放生命周期，用于 getElementsAtTime） */
const playbackVerovioToolkit = ref<import('verovio/esm').VerovioToolkit | null>(null)
/** SVG 渲染所用的 Verovio toolkit（保持存活以复用元素 ID） */
const displayVerovioToolkit = ref<import('verovio/esm').VerovioToolkit | null>(null)
/** 当前播放 MIDI 的速度映射表（用于 tick → ms 转换） */
const midiTempoMap = ref<MidiTempoMap | null>(null)
const playbackIndicatorVisible = ref(false)
const playbackIndicatorProgress = ref(0)
/** 每帧由播放逻辑写入的指示线目标位置；展示值向其缓动，避免离散跳变 */
let playbackIndicatorTargetProgress = 0
let playbackIndicatorVisualLastFrameAt = 0
/** 指示线水平范围：DOM start/span；OSMD 时另有 inkLeft/inkSpan（页内墨迹，视口无关） */
const playbackIndicatorLayout = ref<{
  startRatio: number
  spanRatio: number
  inkLeft?: number
  inkSpan?: number
}>({ startRatio: 0, spanRatio: 1 })
/** 指示线纵向定位（px，基于指示线容器坐标系）。top/bottom 直接对齐当前 system 包围盒边缘。 */
const playbackIndicatorLineTopPx = ref(0)
const playbackIndicatorLineBottomPx = ref(24)
/** 指示线系统布局缓存：按 system 从上到下的顺序 */
const playbackIndicatorSystemsLayout = ref<PlaybackSystemLayout[] | null>(null)
let playbackActiveSystemIndex = 0
let playbackActiveSystemPage = -1
let playbackIndicatorSystemsLayoutMeasuredPage = -1
/** 指示线横向：progress 0→1 对应宿主 left 比例（避免每帧 measurePageMusicInkClientRect） */
let playbackIndicatorDisplayGeom: { leftAt0: number; leftAt1: number } | null = null
const playbackIndicatorDisplayLeftPercent = ref(0)
/** 逻辑帧写入 target 后，视觉帧按 progress/秒 外推，填补 updatePlaybackCursor 间隔 */
let playbackIndicatorTargetSampleAt = 0
let playbackIndicatorTargetSampleProgress = 0
let playbackIndicatorTargetVelocity = 0

function invalidatePlaybackIndicatorDisplayGeom() {
  playbackIndicatorDisplayGeom = null
}

function updatePlaybackIndicatorDisplayLeft() {
  const g = playbackIndicatorDisplayGeom
  const p = playbackIndicatorProgress.value
  const ratio = g ? g.leftAt0 + (g.leftAt1 - g.leftAt0) * p : p
  playbackIndicatorDisplayLeftPercent.value = ratio * 100
}

/** 在翻页 / 换 system / resize 后调用一次；播放中勿每帧调用。 */
function rebuildPlaybackIndicatorDisplayGeom() {
  const layout = playbackIndicatorLayout.value
  const domCtx = getPlaybackPageDomContext(currentPage.value)
  const host =
    domCtx?.coordsHost ?? (viewMode.value === 'page' ? pageSwipeHostRef.value : scrollHostRef.value)
  if (!host) {
    playbackIndicatorDisplayGeom = {
      leftAt0: layout.startRatio,
      leftAt1: layout.startRatio + layout.spanRatio,
    }
    updatePlaybackIndicatorDisplayLeft()
    return
  }
  const hostRect = host.getBoundingClientRect()
  if (
    renderEngine.value === 'osmd' &&
    typeof layout.inkLeft === 'number' &&
    typeof layout.inkSpan === 'number'
  ) {
    const svg =
      domCtx?.svg ??
      host.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      host.querySelector<SVGSVGElement>('svg')
    const musicInk = measurePageMusicInkClientRect(host, svg)
    if (musicInk && hostRect.width > 1) {
      playbackIndicatorDisplayGeom = {
        leftAt0: mapInkNormXToHostLeftRatio(layout.inkLeft, musicInk, hostRect),
        leftAt1: mapInkNormXToHostLeftRatio(layout.inkLeft + layout.inkSpan, musicInk, hostRect),
      }
      updatePlaybackIndicatorDisplayLeft()
      return
    }
  }
  playbackIndicatorDisplayGeom = {
    leftAt0: layout.startRatio,
    leftAt1: layout.startRatio + layout.spanRatio,
  }
  updatePlaybackIndicatorDisplayLeft()
}

function getPlaybackIndicatorEffectiveTarget(): number {
  if (!orchestraPlaying.value || playbackIndicatorTargetSampleAt <= 0) {
    return playbackIndicatorTargetProgress
  }
  const elapsed = performance.now() - playbackIndicatorTargetSampleAt
  if (elapsed > 140) return playbackIndicatorTargetProgress
  if (Math.abs(playbackIndicatorTargetVelocity) < 1e-9) return playbackIndicatorTargetProgress
  return Math.max(
    0,
    Math.min(1, playbackIndicatorTargetSampleProgress + playbackIndicatorTargetVelocity * elapsed),
  )
}

function getOsmdSystemNormBoundsForPage(page1Based: number): OsmdMusicSystemNormBounds[] | undefined {
  if (renderEngine.value !== 'osmd') return undefined
  const row = osmdPageMusicSystemNormBounds.value[page1Based - 1]
  if (!row?.length) return undefined
  return row
}

/** 播放指示线：按页解析 DOM。滚动模式下 coordsHost 为整列容器，queryRoot/svg 为当前页 block。 */
function getPlaybackPageDomContext(page1Based: number): {
  coordsHost: HTMLElement
  queryRoot: HTMLElement
  svg: SVGSVGElement | null
} | null {
  const page = Math.max(1, Math.floor(page1Based || 1))
  if (viewMode.value === 'page') {
    const coordsHost = pageSwipeHostRef.value
    if (!coordsHost) return null
    const svg =
      coordsHost.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      coordsHost.querySelector<SVGSVGElement>('svg')
    return { coordsHost, queryRoot: coordsHost, svg }
  }
  const coordsHost = scrollHostRef.value
  if (!coordsHost) return null
  const blocks = coordsHost.querySelectorAll<HTMLElement>('.score-scroll-page-block')
  const queryRoot = blocks[page - 1]
  if (!queryRoot) return null
  const svg =
    queryRoot.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
    queryRoot.querySelector<SVGSVGElement>('svg')
  return { coordsHost, queryRoot, svg }
}

function measurePlaybackSystemsLayoutForPage(
  coordsHost: HTMLElement | null,
  svg: SVGSVGElement | null,
  page1Based: number,
) {
  const systemNormBounds = getOsmdSystemNormBoundsForPage(page1Based)
  const measured = measurePlaybackSystemsLayout(coordsHost, svg, {
    systemNormBounds,
  })
  // 仅钢琴等「OSMD 误报 1 system、DOM 实为多双手谱块」时重测；总谱整页连谱保持单 system
  let layouts = measured
  if (layouts?.length === 1 && coordsHost && svg && shouldSplitSingleSystemPlaybackLayout(svg)) {
    const retried = measurePlaybackSystemsLayout(coordsHost, svg, { systemNormBounds: undefined })
    if (retried && retried.length > 1) {
      layouts = retried
    }
  }
  if (!layouts?.length) return layouts
  if (renderEngine.value !== 'osmd') return layouts
  const inkSpans = osmdPageMeasureInkNormSpans.value[page1Based - 1]
  if (!inkSpans?.length) return layouts
  return attachInkHorizontalRangesToSystems(layouts, inkSpans, systemNormBounds)
}

function syncPlaybackIndicatorVerticalForSystem(
  pageHost: HTMLElement | null,
  page1Based: number,
  systemIndex: number,
): boolean {
  let layouts = playbackIndicatorSystemsLayout.value
  if (
    !layouts?.length ||
    playbackIndicatorSystemsLayoutMeasuredPage !== page1Based
  ) {
    const ctx = getPlaybackPageDomContext(page1Based) ?? (pageHost ? { coordsHost: pageHost, queryRoot: pageHost, svg: null as SVGSVGElement | null } : null)
    if (!ctx) return false
    const svg =
      ctx.svg ??
      ctx.queryRoot.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      ctx.queryRoot.querySelector<SVGSVGElement>('svg')
    const measured = measurePlaybackSystemsLayoutForPage(ctx.coordsHost, svg, page1Based)
    if (!measured?.length) return false
    playbackIndicatorSystemsLayout.value = measured
    playbackIndicatorSystemsLayoutMeasuredPage = page1Based
    layouts = measured
  }
  const idx = Math.max(0, Math.min(layouts.length - 1, systemIndex))
  const sys = layouts[idx]
  if (!sys) return false
  const ctx = getPlaybackPageDomContext(page1Based)
  applyPlaybackIndicatorSystemVertical(sys, {
    coordsHost: ctx?.coordsHost ?? pageHost,
    page1Based,
    systemIndex: idx,
    svg: ctx?.svg,
  })
  return true
}

const currentPlaybackTick = ref(0)
const currentPlaybackHitElementIds = ref<string[]>([])
const playbackElementIndex = ref<PlaybackElementIndex>({ entries: [], idToEntry: new Map() })
const playbackElementIndexCacheKey = ref('')
const playbackElementIndexResolved = ref(false)
const pageFlipFlashVisible = ref(false)
const pageFlipFlashText = ref('')
let pageFlipFlashTimer: number | null = null
const orchestraAlignmentDebugUiEnabled = orchestraDebugEnabled
const playbackIndicatorPercentText = computed(
  () => `${Math.round(playbackIndicatorProgress.value * 100)}%`,
)

function syncPlaybackIndicatorLayoutFromSystem(sysLayout: PlaybackSystemLayout) {
  playbackIndicatorLayout.value = {
    startRatio: sysLayout.startRatio,
    spanRatio: sysLayout.spanRatio,
    ...(typeof sysLayout.inkLeft === 'number' && typeof sysLayout.inkSpan === 'number'
      ? { inkLeft: sysLayout.inkLeft, inkSpan: sysLayout.inkSpan }
      : {}),
  }
  rebuildPlaybackIndicatorDisplayGeom()
}
const PLAYBACK_INDICATOR_FOOTER_RESERVE_PX = 24

/** 用 top/bottom 定位；横向 left 来自缓存几何，播放中不读 DOM。 */
const playbackIndicatorLineStyle = computed(() => {
  const left = `${playbackIndicatorDisplayLeftPercent.value}%`
  const topPx = playbackIndicatorLineTopPx.value
  const bottomPx = playbackIndicatorLineBottomPx.value
  return {
    left,
    top: `${topPx}px`,
    bottom: `${Math.max(PLAYBACK_INDICATOR_FOOTER_RESERVE_PX, bottomPx)}px`,
  }
})

/**
 * 将指示线纵向对齐到指定 system；播放中每帧从 DOM 重测，避免缩放/视口变化后仍用缓存 px。
 */
function applyPlaybackIndicatorSystemVertical(
  sysLayout: PlaybackSystemLayout,
  opts?: {
    coordsHost?: HTMLElement | null
    page1Based?: number
    systemIndex?: number
    svg?: SVGSVGElement | null
    /** 播放中每帧重测时设为 false，只更新纵向，避免 inkLeft/inkSpan 抖动 */
    refreshHorizontal?: boolean
  },
) {
  if (opts?.refreshHorizontal === false) {
    playbackIndicatorLineTopPx.value = Math.max(0, sysLayout.topPx)
    playbackIndicatorLineBottomPx.value = Math.max(
      PLAYBACK_INDICATOR_FOOTER_RESERVE_PX,
      sysLayout.bottomPx,
    )
    return
  }
  let layout = sysLayout
  const page1Based = opts?.page1Based
  const domCtx = page1Based != null && page1Based > 0 ? getPlaybackPageDomContext(page1Based) : null
  const host = opts?.coordsHost ?? domCtx?.coordsHost ?? null
  if (host && page1Based != null && page1Based > 0) {
    const svg =
      opts?.svg ??
      domCtx?.svg ??
      host.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      host.querySelector<SVGSVGElement>('svg')
    const fresh = measurePlaybackSystemsLayoutForPage(host, svg, page1Based)
    const idx = Math.max(
      0,
      Math.min((fresh?.length ?? 1) - 1, opts?.systemIndex ?? 0),
    )
    const live = fresh?.[idx]
    if (live) {
      layout = live
      const cached = playbackIndicatorSystemsLayout.value
      if (
        cached &&
        playbackIndicatorSystemsLayoutMeasuredPage === page1Based &&
        idx < cached.length
      ) {
        cached[idx] = {
          ...cached[idx]!,
          topPx: live.topPx,
          bottomPx: live.bottomPx,
          nyTop: live.nyTop,
          nyBottom: live.nyBottom,
          inkLeft: live.inkLeft,
          inkSpan: live.inkSpan,
        }
        if (idx === playbackActiveSystemIndex) {
          syncPlaybackIndicatorLayoutFromSystem(cached[idx]!)
        }
      }
    }
  }
  playbackIndicatorLineTopPx.value = Math.max(0, layout.topPx)
  playbackIndicatorLineBottomPx.value = Math.max(
    PLAYBACK_INDICATOR_FOOTER_RESERVE_PX,
    layout.bottomPx,
  )
}

function applyPlaybackIndicatorVerticalFromOsmdSystemBounds(
  host: HTMLElement,
  page1Based: number,
  systemIndex: number,
): boolean {
  const sysBounds = getOsmdSystemNormBoundsForPage(page1Based)
  const b = sysBounds?.[systemIndex]
  if (!b || !Number.isFinite(b.top) || !Number.isFinite(b.bottom) || b.bottom <= b.top) {
    return false
  }
  const domCtx = getPlaybackPageDomContext(page1Based)
  const coordsHost = domCtx?.coordsHost ?? host
  const svg =
    domCtx?.svg ??
    host.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
    host.querySelector<SVGSVGElement>('svg')
  const musicInk = measurePageMusicInkClientRect(coordsHost, svg)
  const hostRect = coordsHost.getBoundingClientRect()
  if (!musicInk || hostRect.height <= 1) return false
  const topClient = musicInk.top + b.top * musicInk.height
  const bottomClient = musicInk.top + b.bottom * musicInk.height
  playbackIndicatorLineTopPx.value = Math.max(0, topClient - hostRect.top)
  playbackIndicatorLineBottomPx.value = Math.max(
    PLAYBACK_INDICATOR_FOOTER_RESERVE_PX,
    hostRect.bottom - bottomClient,
  )
  return true
}
const playbackTickText = computed(() => {
  const tick = Math.min(currentPlaybackTick.value, currentMidiTotalTicks.value)
  return `${tick} / ${currentMidiTotalTicks.value}`
})
let orchestraResumeEligible = false
let playbackLockedEntryIndex = -1
let playbackLockedEntryId = ''
let playbackLockedEntryPage = -1
let playbackLockedEntryTick = -1
let playbackPlaybackEntryResetReason: 'page-turn' | 'seek' | 'pause-resume' | 'init' | 'cleanup' = 'init'

let lastIndicatorDebug:
  | {
      reason: string
      millisec: number
      page: number
      currentMidiTotalMs: number
      midiTempoEventsLen: number
      systemsLayoutMeasuredPage: number
      systemsLayoutLen: number
      idsLen: number
      foundInDomCount?: number
      rectValidCount?: number
      idsSample?: string[]
      bestRectFound: boolean
      hitElementId?: string | null
      hitElementIds?: string[]
    }
  | null = null
let lastIndicatorFailLogAt = 0
let lastMidiPreparedLogAt = 0
let lastSemanticPlaybackLogAt = 0
let lastRefreshSemanticRebuildKey = ''
let playbackSemanticPageReliable = false
let playbackElementPageMap: Map<string, number> | null = null
let playbackElementPageMapCacheKey = ''
let lastStablePlaybackTick = 0
let lastTickRegressionLogAt = 0

function ensurePlaybackElementPageMapFromRenderedPages(): Map<string, number> {
  const pages = pagesSvg.value
  const cacheKey = `${selectedCacheKey.value}|${pages.length}|${pages[0]?.length ?? 0}|${pages[pages.length - 1]?.length ?? 0}`
  if (playbackElementPageMap && playbackElementPageMapCacheKey === cacheKey) return playbackElementPageMap
  const idToPage = new Map<string, number>()
  const idRegex = /\sid="([^"]+)"/g
  pages.forEach((svg, idx) => {
    idRegex.lastIndex = 0
    const page = idx + 1
    let m: RegExpExecArray | null
    while ((m = idRegex.exec(svg)) !== null) {
      const id = (m[1] ?? '').trim().replace(/^#/, '')
      if (!id || idToPage.has(id)) continue
      idToPage.set(id, page)
    }
  })
  playbackElementPageMap = idToPage
  playbackElementPageMapCacheKey = cacheKey
  return idToPage
}

function buildPlaybackElementIndexIfNeeded(): PlaybackElementIndex {
  const pages = pagesSvg.value
  const cacheKey = `${selectedCacheKey.value}|${pages.length}|${pages[0]?.length ?? 0}|${pages[pages.length - 1]?.length ?? 0}`
  if (playbackElementIndexResolved.value && playbackElementIndexCacheKey.value === cacheKey) {
    return playbackElementIndex.value
  }
  const index = buildPlaybackElementIndexFromSvg(pages)
  playbackElementIndex.value = index
  playbackElementIndexCacheKey.value = cacheKey
  playbackElementIndexResolved.value = true
  return index
}

function resolvePlaybackElementIdsFromIndex(ids: string[]): string[] {
  const index = buildPlaybackElementIndexIfNeeded()
  const resolved: string[] = []
  const seen = new Set<string>()
  for (const rawId of ids) {
    const id = rawId.trim().replace(/^#/, '')
    if (!id || seen.has(id)) continue
    const entry = index.idToEntry.get(id)
    if (!entry) continue
    resolved.push(entry.id)
    seen.add(entry.id)
  }
  return resolved
}

watch(
  pagesSvg,
  () => {
    playbackElementPageMap = null
    playbackElementPageMapCacheKey = ''
  },
  { deep: false },
)

function evaluateSemanticPageReliability(
  rows: SemanticPlaybackRow[],
  boundaries: number[],
  totalPages: number,
): boolean {
  if (!rows.length || boundaries.length !== totalPages || totalPages < 1) return false
  let violations = 0
  for (const row of rows) {
    const page = Math.max(1, Math.min(totalPages, Math.floor(row.page || 1)))
    const lower = page > 1 ? boundaries[page - 2] ?? 0 : 0
    const upper = boundaries[page - 1] ?? 1
    const p = Math.max(0, Math.min(1, row.progressStart))
    // 允许非常小的浮点误差，但如果大量 row 落在页面边界之外，说明页码映射不可用。
    if (p < lower - 0.002 || p > upper + 0.002) violations += 1
  }
  const ratio = violations / rows.length
  return ratio <= 0.02
}

function rebuildSemanticPlaybackRows(
  toolkit: import('verovio/esm').VerovioToolkit,
  sourceXml: string,
  context: string,
  totalTicksHint = 0,
) {
  const perf = createOrchestraPerfTimer(`rebuildSemanticPlaybackRows:${context}`)
  let effectiveTotalTicks = Math.max(0, Math.floor(totalTicksHint || 0))
  const logPrefix = '[semantic-build]'
  if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
    // eslint-disable-next-line no-console
    console.log(`${logPrefix}:start`, {
      context,
      totalTicksHint,
      effectiveTotalTicks,
      pages: toolkit.getPageCount(),
      cacheKey: selectedCacheKey.value,
      fileName: fileName.value,
      hasMidi: currentMidiBase64.value.trim().length > 0,
      hasPlaybackToolkit: !!playbackVerovioToolkit.value,
      hasDisplayToolkit: !!displayVerovioToolkit.value,
    })
  }
  if (effectiveTotalTicks <= 0) {
    if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
      // eslint-disable-next-line no-console
      console.log(`${logPrefix}:render-midi-request`, { context })
    }
    const midi = toolkit.renderToMIDI()
    perf.mark('renderToMIDI')
    if (midi) {
      effectiveTotalTicks = getMidiTotalTicksFromBase64(midi)
      currentMidiBase64.value = midi
      currentMidiTotalTicks.value = effectiveTotalTicks
      midiTempoMap.value = parseMidiTempoMap(midi)
      if (effectiveTotalTicks > 0) {
        currentMidiTotalMs.value = ticksToMilliseconds(
          effectiveTotalTicks,
          midiTempoMap.value?.ppq ?? 480,
          midiTempoMap.value?.events ?? [],
        )
      }
      if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
        // eslint-disable-next-line no-console
        console.log(`${logPrefix}:midi-ready`, {
          context,
          effectiveTotalTicks,
          totalMs: currentMidiTotalMs.value,
          ppq: midiTempoMap.value?.ppq ?? null,
          tempoEventsLen: midiTempoMap.value?.events?.length ?? 0,
        })
      }
    } else if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
      // eslint-disable-next-line no-console
      console.log(`${logPrefix}:midi-missing`, { context })
    }
  } else {
    perf.mark('renderToMIDI:skipped')
  }
  const rows = buildSemanticPlaybackRows(sourceXml, toolkit, {
    totalTicks: effectiveTotalTicks,
    pageBoundaryProgress: playbackPageBoundaries.value,
    systemBoundaryProgressByPage: playbackSystemBoundariesByPage.value,
    elementPageResolver: (id: string) => {
      const map = ensurePlaybackElementPageMapFromRenderedPages()
      return map.get(id) ?? null
    },
  })
  perf.mark('buildSemanticPlaybackRows')
  playbackSemanticRows.value = rows
  playbackSemanticPageReliable = evaluateSemanticPageReliability(
    rows,
    playbackPageBoundaries.value,
    Math.max(1, toolkit.getPageCount()),
  )
  perf.mark('evaluateSemanticPageReliability')
  if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
    // eslint-disable-next-line no-console
    console.log(`${logPrefix}:done`, {
      context,
      rows: rows.length,
      effectiveTotalTicks,
      totalTicksHint,
      pages: toolkit.getPageCount(),
      cacheKey: selectedCacheKey.value,
      fileName: fileName.value,
      firstRow: rows[0] ?? null,
      lastRow: rows[rows.length - 1] ?? null,
      displayToolkitReady: !!displayVerovioToolkit.value,
      playbackToolkitReady: !!playbackVerovioToolkit.value,
      midiBase64Len: currentMidiBase64.value.length,
      semanticPageReliable: playbackSemanticPageReliable,
    })
  }
  perf.finish({
    context,
    rows: rows.length,
    effectiveTotalTicks,
    pages: toolkit.getPageCount(),
    semanticPageReliable: playbackSemanticPageReliable,
  })
}

function syncPlaybackIndicatorVisualProgress(forceSnap: boolean) {
  const target = forceSnap ? playbackIndicatorTargetProgress : getPlaybackIndicatorEffectiveTarget()
  if (forceSnap || !orchestraPlaying.value) {
    playbackIndicatorProgress.value = target
    playbackIndicatorVisualLastFrameAt = 0
    updatePlaybackIndicatorDisplayLeft()
    return
  }
  const now = performance.now()
  const dtSec =
    playbackIndicatorVisualLastFrameAt > 0
      ? Math.min(0.1, (now - playbackIndicatorVisualLastFrameAt) / 1000)
      : 1 / 60
  playbackIndicatorVisualLastFrameAt = now
  const cur = playbackIndicatorProgress.value
  const alpha = 1 - Math.exp(-28 * dtSec)
  playbackIndicatorProgress.value = cur + (target - cur) * alpha
  updatePlaybackIndicatorDisplayLeft()
}

function updatePlaybackIndicator(progress: number, hitElementIds: string[] = [], opts?: { snap?: boolean }) {
  if (orchestraNotePreviewActive.value) return
  const p = Math.max(0, Math.min(1, progress))
  const now = performance.now()
  if (playbackIndicatorTargetSampleAt > 0) {
    const dt = now - playbackIndicatorTargetSampleAt
    if (dt > 0.5) {
      playbackIndicatorTargetVelocity = (p - playbackIndicatorTargetSampleProgress) / dt
    }
  }
  playbackIndicatorTargetSampleAt = now
  playbackIndicatorTargetSampleProgress = p
  playbackIndicatorTargetProgress = p
  playbackIndicatorVisible.value = true
  currentPlaybackHitElementIds.value = [...hitElementIds]
  if (opts?.snap) {
    playbackIndicatorTargetVelocity = 0
    syncPlaybackIndicatorVisualProgress(true)
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function normalizePlaybackElementId(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim().replace(/^#/, '')
  if (raw && typeof raw === 'object' && 'id' in (raw as object)) {
    const v = (raw as { id?: unknown }).id
    if (typeof v === 'string') return v.trim().replace(/^#/, '')
  }
  return String(raw ?? '')
    .trim()
    .replace(/^#/, '')
}

function buildPlaybackIdCandidates(id: string): string[] {
  const trimmed = id.trim()
  if (!trimmed) return []
  const noHash = trimmed.replace(/^#/, '')
  const decoded = (() => {
    try {
      return decodeURIComponent(noHash)
    } catch {
      return noHash
    }
  })()
  const candidates = [trimmed, noHash, decoded]
  return [...new Set(candidates.filter(Boolean))]
}

/**
 * 按 Verovio 文档，优先用 `getElementById`；再退回当前页 SVG 内 querySelector。
 * Ion / Shadow DOM 时元素可能不在 `document` 的 id 映射里，需查 `getRootNode()`。
 */
function findPlaybackDomElementByXmlId(queryRoot: HTMLElement, rootSvg: SVGSVGElement | null, id: string): Element | null {
  const candidates = buildPlaybackIdCandidates(id)
  if (!candidates.length) return null
  const inSubtree = (el: Element) =>
    queryRoot.contains(el) || !!(rootSvg && (el === rootSvg || rootSvg.contains(el)))

  const tryRoot = (root: Document | ShadowRoot | null): Element | null => {
    if (!root) return null
    for (const candidate of candidates) {
      try {
        const el = root.getElementById(candidate)
        if (el && inSubtree(el)) return el
      } catch {
        /* 非法 id 字符等 */
      }
    }
    return null
  }

  const tree = queryRoot.getRootNode()
  let el = tree instanceof ShadowRoot ? tryRoot(tree) : null
  if (!el && queryRoot.ownerDocument) {
    el = tryRoot(queryRoot.ownerDocument)
  }
  if (!el && rootSvg) {
    for (const candidate of candidates) {
      try {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          const esc = CSS.escape(candidate)
          const hit =
            rootSvg.querySelector(`[id="${esc}"]`) ??
            rootSvg.querySelector(`[xml\\:id="${esc}"]`) ??
            rootSvg.querySelector(`[data-id="${esc}"]`) ??
            rootSvg.querySelector(`[id$="${esc}"]`)
          if (hit && inSubtree(hit)) return hit
        } else {
          const hit =
            rootSvg.querySelector(`[id="${candidate}"]`) ??
            rootSvg.querySelector(`[xml\\:id="${candidate}"]`) ??
            rootSvg.querySelector(`[data-id="${candidate}"]`)
          if (hit && inSubtree(hit)) return hit
        }
      } catch {
        /* ignore */
      }
    }
  }
  return el
}

/**
 * 用 verovio playback toolkit 的当前时间元素（notes/rests）来定位指示线，
 * 让指示线在 rests / forward / tempo 变化时也跟随实际内容推进，而不是匀速扫过。
 */
async function tryUpdatePlaybackIndicatorByElementsAtTime(opts: {
  millisec: number
  indicatorHost: HTMLElement
  queryRoot: HTMLElement
  expectedPage: number
  lockedEntry?: PlaybackElementIndexEntry | null
}): Promise<boolean> {
  const page = opts.expectedPage
  const systemsLayoutMeasuredPage = playbackIndicatorSystemsLayoutMeasuredPage
  const playbackIndex = buildPlaybackElementIndexIfNeeded()
  const systemsLayoutLen = playbackIndicatorSystemsLayout.value?.length ?? 0
  const midiTempoEventsLen = midiTempoMap.value?.events?.length ?? 0

  const markFail = (reason: string, extra: Partial<typeof lastIndicatorDebug extends null ? never : NonNullable<typeof lastIndicatorDebug>> = {}) => {
    lastIndicatorDebug = {
      reason,
      millisec: opts.millisec,
      page,
      currentMidiTotalMs: currentMidiTotalMs.value,
      midiTempoEventsLen,
      systemsLayoutMeasuredPage,
      systemsLayoutLen,
      idsLen: -1,
      foundInDomCount: 0,
      rectValidCount: 0,
      idsSample: [],
      bestRectFound: false,
      ...extra,
    }
  }

  if (!playbackVerovioToolkit.value) {
    markFail('no_playback_toolkit')
    return false
  }
  if (!Number.isFinite(opts.millisec) || opts.millisec < 0) {
    markFail('invalid_millisec')
    return false
  }

  // 换页后 layout 可能还没测量完成：先做一次快速重测，避免直接回退导致“匀速感”。
  if (
    !playbackIndicatorSystemsLayout.value ||
    playbackIndicatorSystemsLayout.value.length === 0 ||
    playbackIndicatorSystemsLayoutMeasuredPage !== opts.expectedPage
  ) {
    const svg =
      opts.queryRoot.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      opts.queryRoot.querySelector<SVGSVGElement>('svg')
    const measuredSystems = measurePlaybackSystemsLayoutForPage(
      opts.indicatorHost,
      svg,
      opts.expectedPage,
    )
    const pageSvg =
      opts.queryRoot.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      opts.queryRoot.querySelector<SVGSVGElement>('svg')
    if (measuredSystems && measuredSystems.length > 0) {
      playbackIndicatorSystemsLayout.value = measuredSystems
      playbackIndicatorSystemsLayoutMeasuredPage = opts.expectedPage
      const first = measuredSystems[0]
      syncPlaybackIndicatorLayoutFromSystem(first)
      applyPlaybackIndicatorSystemVertical(first, {
        coordsHost: opts.indicatorHost,
        page1Based: opts.expectedPage,
        systemIndex: 0,
        svg: pageSvg,
      })
    }
  }

  const systemsLayout = playbackIndicatorSystemsLayout.value
  const hasSystems =
    !!systemsLayout &&
    systemsLayout.length > 0 &&
    playbackIndicatorSystemsLayoutMeasuredPage === opts.expectedPage

  if (playbackIndicatorSystemsLayoutMeasuredPage !== opts.expectedPage) {
    markFail('layout_not_for_current_page')
    return false
  }

  if (!midiTempoMap.value || currentMidiTotalMs.value <= 0) {
    markFail('no_midi_tempo_or_totalMs_zero')
    return false
  }

  const ms = Math.max(0, Math.round(Number(opts.millisec) || 0))
  let res = playbackVerovioToolkit.value.getElementsAtTime(ms)
  const verovioPage = typeof res.page === 'number' ? res.page : 0
  if (verovioPage > 0 && verovioPage !== opts.expectedPage) {
    await nextTick()
    res = playbackVerovioToolkit.value.getElementsAtTime(ms)
  }

  const rawIds = [...(res.notes ?? []), ...(res.rests ?? [])]
  const ids = [...new Set(rawIds.map((x) => normalizePlaybackElementId(x)).filter(Boolean))]
  const indexedIds = resolvePlaybackElementIdsFromIndex(ids)
  const effectiveIds = indexedIds.length > 0 ? indexedIds : ids
  if (!effectiveIds.length) {
    markFail('no_notes_or_rests', { idsLen: 0 })
    return false
  }

  const hostRect = opts.indicatorHost.getBoundingClientRect()
  const hostW = hostRect.width
  const hostH = hostRect.height
  if (!Number.isFinite(hostW) || hostW <= 1 || !Number.isFinite(hostH) || hostH <= 1) return false

  const queryRootForLookup = (() => {
    const svgHost = opts.queryRoot.querySelector<HTMLElement>('.score-svg-layer')
    return svgHost ?? opts.queryRoot
  })()
  let rootSvg =
    queryRootForLookup.querySelector<SVGSVGElement>('.score-pinch-viewport .score-svg-layer svg') ??
    queryRootForLookup.querySelector<SVGSVGElement>('.score-svg-layer svg') ??
    queryRootForLookup.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
    queryRootForLookup.querySelector<SVGSVGElement>('svg')

  const locateBestRect = () => {
    let bestScore = Number.POSITIVE_INFINITY
    let bestRect: DOMRect | null = null
    let bestCenterY = 0
    let bestId: string | null = null
    let foundInDomCount = 0
    let rectValidCount = 0
    const idsSample: string[] = []

    const systems = hasSystems ? systemsLayout! : []
    for (const id of effectiveIds) {
      const el = findPlaybackDomElementByXmlId(queryRootForLookup, rootSvg, id)
      if (!el) continue
      foundInDomCount += 1
      if (idsSample.length < 5) idsSample.push(id)
      const r = el.getBoundingClientRect()
      if (!Number.isFinite(r.left) || !Number.isFinite(r.right) || r.width < 1 || r.height < 1) continue
      rectValidCount += 1
      const centerY = r.top + r.height / 2
      let score = r.left
      if (systems.length > 0) {
        let bestYDist = Number.POSITIVE_INFINITY
        systems.forEach((sys) => {
          const sysBottom = hostH - sys.bottomPx
          const top = sys.topPx
          const bottom = sysBottom
          const dist = centerY >= top && centerY <= bottom ? 0 : Math.min(Math.abs(centerY - top), Math.abs(centerY - bottom))
          if (dist < bestYDist) bestYDist = dist
        })
        // 先贴近系统中心，再看水平位置，避免选到上一行/下一行的同名符号。
        score += bestYDist * hostW
      }
      if (score < bestScore) {
        bestScore = score
        bestRect = r
        bestCenterY = centerY
        bestId = id
      }
    }
    return { bestRect, bestCenterY, bestId, foundInDomCount, rectValidCount, idsSample }
  }

  let located = locateBestRect()
  if (!located.bestRect) {
    // 换页/重排后一小段时间内 DOM 可能尚未稳定；补一帧重试。
    await nextTick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    rootSvg =
      queryRootForLookup.querySelector<SVGSVGElement>('.score-pinch-viewport .score-svg-layer svg') ??
      queryRootForLookup.querySelector<SVGSVGElement>('.score-svg-layer svg') ??
      queryRootForLookup.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      queryRootForLookup.querySelector<SVGSVGElement>('svg')
    located = locateBestRect()
  }

  if (!located.bestRect) {
    markFail('no_dom_rect_found', {
      idsLen: effectiveIds.length,
      bestRectFound: false,
      foundInDomCount: located.foundInDomCount,
      rectValidCount: located.rectValidCount,
      idsSample: located.idsSample.length ? located.idsSample : effectiveIds.slice(0, 5),
    })
    return false
  }

  // 通过“元素中心点落在哪个 system”选择纵向范围。
  const yRel = located.bestCenterY - hostRect.top
  let systemIndex = 0
  let startRatio = playbackIndicatorLayout.value.startRatio
  let spanRatio = playbackIndicatorLayout.value.spanRatio

  if (hasSystems) {
    let systemDist = Number.POSITIVE_INFINITY
    systemsLayout!.forEach((sys, idx) => {
      const sysBottom = hostH - sys.bottomPx
      const top = sys.topPx
      const bottom = sysBottom
      const inside = yRel >= top && yRel <= bottom
      const dist = inside ? 0 : Math.min(Math.abs(yRel - top), Math.abs(yRel - bottom))
      if (dist < systemDist) {
        systemDist = dist
        systemIndex = idx
      }
    })

    const sysLayout = systemsLayout![systemIndex]
    if (sysLayout) {
      startRatio = sysLayout.startRatio
      spanRatio = sysLayout.spanRatio
      playbackActiveSystemPage = opts.expectedPage
      playbackActiveSystemIndex = systemIndex
      const pageSvg =
        opts.queryRoot.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
        opts.queryRoot.querySelector<SVGSVGElement>('svg')
      applyPlaybackIndicatorSystemVertical(sysLayout, {
        coordsHost: opts.indicatorHost,
        page1Based: opts.expectedPage,
        systemIndex,
        svg: pageSvg,
      })
      syncPlaybackIndicatorLayoutFromSystem(sysLayout)
    }
  }

  playbackActiveSystemPage = opts.expectedPage
  playbackActiveSystemIndex = systemIndex

  const pageEntries = playbackIndex.entries.filter((entry) => entry.page === opts.expectedPage)
  const findDomRect = (id: string): DOMRect | null => {
    const el = findPlaybackDomElementByXmlId(queryRootForLookup, rootSvg, id)
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!Number.isFinite(r.left) || !Number.isFinite(r.right) || r.width < 1 || r.height < 1) return null
    return r
  }

  const interpolated =
    playbackVerovioToolkit.value && pageEntries.length > 0
      ? interpolatePlaybackIndicatorByTimedEntries({
          currentMs: ms,
          totalMs: currentMidiTotalMs.value,
          pageEntries,
          toolkit: playbackVerovioToolkit.value,
          hostRect,
          startRatio,
          spanRatio,
          findDomRect,
        })
      : null

  let p: number
  let resolvedHitIds: string[]
  if (interpolated) {
    p = interpolated.progress
    resolvedHitIds = resolvePlaybackElementIdsFromIndex(interpolated.hitElementIds)
  } else {
    const xRatio = (located.bestRect.left - hostRect.left) / hostW
    const rawProgress = spanRatio > 1e-9 ? (xRatio - startRatio) / spanRatio : 0
    p = Math.max(0, Math.min(1, rawProgress))
    resolvedHitIds = resolvePlaybackElementIdsFromIndex(located.bestId ? [located.bestId] : ids)
  }

  updatePlaybackIndicator(clamp01(p), resolvedHitIds)

  lastIndicatorDebug = {
    reason: 'ok',
    millisec: opts.millisec,
    page,
    currentMidiTotalMs: currentMidiTotalMs.value,
    midiTempoEventsLen,
    systemsLayoutMeasuredPage,
    systemsLayoutLen,
    idsLen: ids.length,
    hitElementId: located.bestId,
    hitElementIds: ids,
    bestRectFound: true,
  }
  return true
}

function refreshPlaybackStaffLayoutFromDom() {
  if (!pageSwipeHostRef.value) return
  const debugEnabled = orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled
  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[playback-layout]:refresh-start', {
      viewMode: viewMode.value,
      currentPage: currentPage.value,
      hasHost: !!pageSwipeHostRef.value,
      playbackToolkitReady: !!playbackVerovioToolkit.value,
      displayToolkitReady: !!displayVerovioToolkit.value,
    })
  }
  // page 模式：测量当前页 SVG 内每个 system 的布局，用于指示线换行跳转。
  if (viewMode.value !== 'page' || !pageSwipeHostRef.value) {
    playbackIndicatorSystemsLayout.value = null
    playbackIndicatorSystemsLayoutMeasuredPage = -1
    playbackIndicatorLayout.value = { startRatio: 0, spanRatio: 1 }
    invalidatePlaybackIndicatorDisplayGeom()
    playbackIndicatorLineTopPx.value = 0
    playbackIndicatorLineBottomPx.value = 24
    playbackActiveSystemPage = -1
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[playback-layout]:refresh-skip', {
        reason: viewMode.value !== 'page' ? 'not-page-mode' : 'missing-host',
      })
    }
    return
  }

  const svg =
    pageSwipeHostRef.value.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
    pageSwipeHostRef.value.querySelector<SVGSVGElement>('svg')
  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[playback-layout]:refresh-svg', {
      hasSvg: !!svg,
      hostChildren: pageSwipeHostRef.value.childElementCount,
      currentPage: currentPage.value,
    })
  }
  const measuredSystems = measurePlaybackSystemsLayoutForPage(
    pageSwipeHostRef.value,
    svg,
    currentPage.value,
  )
  if (!measuredSystems || measuredSystems.length === 0) {
    playbackIndicatorSystemsLayout.value = null
    playbackIndicatorSystemsLayoutMeasuredPage = -1
    const measuredFallback = measurePlaybackStaffHorizontalRange(pageSwipeHostRef.value)
    playbackIndicatorLayout.value = measuredFallback ?? { startRatio: 0, spanRatio: 1 }
    rebuildPlaybackIndicatorDisplayGeom()
    playbackIndicatorLineTopPx.value = 0
    playbackIndicatorLineBottomPx.value = 0
    playbackActiveSystemPage = -1
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[playback-layout]:refresh-fallback', {
        measuredFallback,
        pageBoundaryProgressLen: playbackPageBoundaries.value.length,
        systemBoundaryProgressByPageLen: playbackSystemBoundariesByPage.value.length,
      })
    }
    return
  }

  playbackIndicatorSystemsLayout.value = measuredSystems
  playbackIndicatorSystemsLayoutMeasuredPage = currentPage.value
  playbackActiveSystemPage = -1
  // 默认先落到第一个 system，播放后会在 updatePlaybackCursor 中根据系统边界重选。
  const first = measuredSystems[0]
  syncPlaybackIndicatorLayoutFromSystem(first)
  applyPlaybackIndicatorSystemVertical(first, {
    coordsHost: pageSwipeHostRef.value,
    page1Based: currentPage.value,
    systemIndex: 0,
  })
  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[playback-layout]:refresh-success', {
      measuredSystemsLen: measuredSystems.length,
      first,
      currentPage: currentPage.value,
    })
  }

  const systemBoundaryProgress = buildSystemBoundaryProgressFromLayouts(measuredSystems)
  const nextSystemBoundariesByPage = [...playbackSystemBoundariesByPage.value]
  nextSystemBoundariesByPage[currentPage.value - 1] = systemBoundaryProgress
  playbackSystemBoundariesByPage.value = nextSystemBoundariesByPage

  if (
    !orchestraPlaying.value &&
    playbackVerovioToolkit.value &&
    currentVerovioSourceXml.value.trim().length > 0 &&
    currentMidiTotalTicks.value > 0
  ) {
    const rebuildKey = JSON.stringify({
      systems: systemBoundaryProgress,
      totalTicks: currentMidiTotalTicks.value,
      rowsLen: playbackSemanticRows.value.length,
    })
    if (rebuildKey !== lastRefreshSemanticRebuildKey) {
      lastRefreshSemanticRebuildKey = rebuildKey
      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.log('[playback-layout]:refresh-semantic-skip-rebuild', {
          currentPage: currentPage.value,
          measuredSystemsLen: measuredSystems.length,
          systemBoundaryProgress,
          systemBoundaryProgressLen: systemBoundaryProgress.length,
          pageBoundaryProgress: playbackPageBoundaries.value,
        })
      }
      if (playbackSemanticRows.value.length > 0) {
        schedulePersistCurrentCacheState()
      }
    }
  }
}

let refreshPlaybackStaffLayoutPending = false
let refreshPlaybackStaffLayoutRafId: number | null = null
let refreshPlaybackStaffLayoutTimerId: number | null = null
let refreshPlaybackStaffLayoutLastRunAt = 0
const REFRESH_PLAYBACK_LAYOUT_THROTTLE_MS = 160

function scheduleRefreshPlaybackStaffLayout() {
  const now = Date.now()
  const elapsed = now - refreshPlaybackStaffLayoutLastRunAt
  const run = () => {
    refreshPlaybackStaffLayoutPending = false
    refreshPlaybackStaffLayoutLastRunAt = Date.now()
    refreshPlaybackStaffLayoutRafId = null
    refreshPlaybackStaffLayoutTimerId = null
    refreshPlaybackStaffLayoutFromDom()
  }

  if (refreshPlaybackStaffLayoutPending) return
  refreshPlaybackStaffLayoutPending = true

  const schedule = () => {
    refreshPlaybackStaffLayoutRafId = window.requestAnimationFrame(() => {
      void nextTick(() => run())
    })
  }

  if (elapsed >= REFRESH_PLAYBACK_LAYOUT_THROTTLE_MS) {
    schedule()
    return
  }

  refreshPlaybackStaffLayoutTimerId = window.setTimeout(() => {
    schedule()
  }, Math.max(16, REFRESH_PLAYBACK_LAYOUT_THROTTLE_MS - elapsed))
}

async function getScoreScrollElement(): Promise<HTMLElement | null> {
  if (cachedScoreScrollElement) return cachedScoreScrollElement
  const contentRef = scoreContentRef.value as
    | (InstanceType<typeof IonContent> & { $el?: HTMLElement; getScrollElement?: () => Promise<HTMLElement> })
    | HTMLElement
    | null
  const host = contentRef && '$el' in contentRef ? (contentRef.$el ?? null) : contentRef
  if (!host) return null
  const ionLike = host as HTMLElement & { getScrollElement?: () => Promise<HTMLElement> }
  if (typeof ionLike.getScrollElement === 'function') {
    try {
      cachedScoreScrollElement = await ionLike.getScrollElement()
      return cachedScoreScrollElement
    } catch {
      // ignore and fallback
    }
  }
  cachedScoreScrollElement = host
  return cachedScoreScrollElement
}

function clearScrollPlaybackFollowResumeTimer() {
  if (scrollPlaybackFollowResumeTimer !== null) {
    window.clearTimeout(scrollPlaybackFollowResumeTimer)
    scrollPlaybackFollowResumeTimer = null
  }
}

function resetScrollPlaybackFollowState() {
  scrollPlaybackFollowPaused = false
  lastProgrammaticScrollTop = null
  scoreScrollFollowTouchTracking = false
  clearScrollPlaybackFollowResumeTimer()
}

function shouldTrackScrollPlaybackFollowInput(): boolean {
  return (
    viewMode.value === 'scroll' &&
    orchestraPlaying.value &&
    scrollPlaybackAutoFollowEnabled.value
  )
}

function scheduleScrollPlaybackFollowResume() {
  clearScrollPlaybackFollowResumeTimer()
  scrollPlaybackFollowResumeTimer = window.setTimeout(() => {
    scrollPlaybackFollowResumeTimer = null
    scrollPlaybackFollowPaused = false
    lastProgrammaticScrollTop = null
    void updatePlaybackCursor()
  }, SCROLL_PLAYBACK_FOLLOW_RESUME_MS)
}

/** 用户开始手动滚动：立刻停止自动跟滚，10s 无操作后再恢复。 */
function pauseScrollPlaybackFollowFromUser() {
  if (!shouldTrackScrollPlaybackFollowInput()) return
  scrollPlaybackFollowPaused = true
  lastProgrammaticScrollTop = null
  scheduleScrollPlaybackFollowResume()
}

function onScoreScrollForPlaybackFollow() {
  if (!shouldTrackScrollPlaybackFollowInput()) return
  const el = scoreScrollPlaybackFollowListenerEl
  if (!el) return

  if (scrollPlaybackFollowPaused) {
    scheduleScrollPlaybackFollowResume()
    return
  }

  if (lastProgrammaticScrollTop !== null) {
    const delta = Math.abs(el.scrollTop - lastProgrammaticScrollTop)
    if (delta <= SCROLL_PLAYBACK_FOLLOW_PROGRAMMATIC_EPS_PX) return
  }

  pauseScrollPlaybackFollowFromUser()
}

function isEventOverScoreScrollArea(target: EventTarget | null, clientX?: number, clientY?: number): boolean {
  const host = scrollHostRef.value
  if (host) {
    if (target instanceof Node && host.contains(target)) return true
    if (clientX != null && clientY != null) {
      const rect = host.getBoundingClientRect()
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return true
      }
    }
  }
  const scrollEl = scoreScrollPlaybackFollowListenerEl
  if (scrollEl && target instanceof Node && scrollEl.contains(target)) return true
  return false
}

function onWindowTouchStartForPlaybackFollow(e: TouchEvent) {
  if (!shouldTrackScrollPlaybackFollowInput()) {
    scoreScrollFollowTouchTracking = false
    return
  }
  if (!isEventOverScoreScrollArea(e.target)) {
    scoreScrollFollowTouchTracking = false
    return
  }
  scoreScrollFollowTouchStartY = e.touches[0]?.clientY ?? 0
  scoreScrollFollowTouchTracking = true
}

function onWindowTouchMoveForPlaybackFollow(e: TouchEvent) {
  if (!shouldTrackScrollPlaybackFollowInput()) {
    scoreScrollFollowTouchTracking = false
    return
  }
  const touch = e.touches[0]
  if (!touch) return
  if (!scoreScrollFollowTouchTracking) {
    if (!isEventOverScoreScrollArea(e.target, touch.clientX, touch.clientY)) return
    scoreScrollFollowTouchStartY = touch.clientY
    scoreScrollFollowTouchTracking = true
    return
  }
  if (Math.abs(touch.clientY - scoreScrollFollowTouchStartY) < 10) return
  scoreScrollFollowTouchTracking = false
  if (scrollPlaybackFollowPaused) {
    scheduleScrollPlaybackFollowResume()
    return
  }
  pauseScrollPlaybackFollowFromUser()
}

function onWindowTouchEndForPlaybackFollow() {
  scoreScrollFollowTouchTracking = false
}

function onWindowWheelForPlaybackFollow(e: WheelEvent) {
  if (!shouldTrackScrollPlaybackFollowInput()) return
  if (Math.abs(e.deltaY) < 1 && Math.abs(e.deltaX) < 1) return
  if (!isEventOverScoreScrollArea(e.target, e.clientX, e.clientY)) return
  if (scrollPlaybackFollowPaused) {
    scheduleScrollPlaybackFollowResume()
    return
  }
  pauseScrollPlaybackFollowFromUser()
}

function setPlaybackAutoScrollTop(scrollEl: HTMLElement, top: number) {
  const next = Math.max(0, top)
  lastProgrammaticScrollTop = next
  scrollEl.scrollTop = next
}

const scoreScrollPlaybackFollowListenerOpts = { passive: true } as const
const windowScrollPlaybackFollowCaptureOpts = { passive: true, capture: true } as const

function attachWindowScrollPlaybackFollowListeners() {
  if (windowScrollPlaybackFollowListenersAttached) return
  windowScrollPlaybackFollowListenersAttached = true
  window.addEventListener('touchstart', onWindowTouchStartForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.addEventListener('touchmove', onWindowTouchMoveForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.addEventListener('touchend', onWindowTouchEndForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.addEventListener('touchcancel', onWindowTouchEndForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.addEventListener('wheel', onWindowWheelForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
}

function detachWindowScrollPlaybackFollowListeners() {
  if (!windowScrollPlaybackFollowListenersAttached) return
  windowScrollPlaybackFollowListenersAttached = false
  window.removeEventListener('touchstart', onWindowTouchStartForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.removeEventListener('touchmove', onWindowTouchMoveForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.removeEventListener('touchend', onWindowTouchEndForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.removeEventListener('touchcancel', onWindowTouchEndForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  window.removeEventListener('wheel', onWindowWheelForPlaybackFollow, windowScrollPlaybackFollowCaptureOpts)
  scoreScrollFollowTouchTracking = false
}

function detachScoreScrollPlaybackFollowListener() {
  const el = scoreScrollPlaybackFollowListenerEl
  if (!el) return
  el.removeEventListener('scroll', onScoreScrollForPlaybackFollow)
  scoreScrollPlaybackFollowListenerEl = null
}

async function ensureScoreScrollPlaybackFollowListener() {
  const el = await getScoreScrollElement()
  if (!el) return
  if (el === scoreScrollPlaybackFollowListenerEl) return
  detachScoreScrollPlaybackFollowListener()
  scoreScrollPlaybackFollowListenerEl = el
  el.addEventListener('scroll', onScoreScrollForPlaybackFollow, scoreScrollPlaybackFollowListenerOpts)
}

function syncScrollPlaybackFollowInputListeners() {
  const active = viewMode.value === 'scroll' && orchestraPlaying.value
  if (active) {
    void ensureScoreScrollPlaybackFollowListener()
    attachWindowScrollPlaybackFollowListeners()
    return
  }
  detachWindowScrollPlaybackFollowListeners()
  detachScoreScrollPlaybackFollowListener()
  resetScrollPlaybackFollowState()
}

function clearPlaybackIndicator() {
  playbackIndicatorVisible.value = false
  playbackIndicatorProgress.value = 0
  playbackIndicatorTargetProgress = 0
  playbackIndicatorVisualLastFrameAt = 0
  playbackIndicatorTargetSampleAt = 0
  playbackIndicatorTargetSampleProgress = 0
  playbackIndicatorTargetVelocity = 0
  invalidatePlaybackIndicatorDisplayGeom()
  playbackIndicatorDisplayLeftPercent.value = 0
  currentPlaybackTick.value = 0
  currentPlaybackHitElementIds.value = []
  playbackIndicatorScrollMeasuredPage = 0
  playbackIndicatorLineTopPx.value = 0
  playbackIndicatorLineBottomPx.value = 24
  playbackIndicatorSystemsLayout.value = null
  playbackActiveSystemIndex = 0
  playbackActiveSystemPage = -1
  playbackIndicatorSystemsLayoutMeasuredPage = -1
  playbackLockedEntryIndex = -1
  playbackLockedEntryId = ''
  playbackLockedEntryPage = -1
  playbackLockedEntryTick = -1
  playbackPlaybackEntryResetReason = 'cleanup'
  resetScrollPlaybackFollowState()
}

function resetPlaybackEntryLock(reason: 'page-turn' | 'seek' | 'pause-resume' | 'init' | 'cleanup') {
  playbackLockedEntryIndex = -1
  playbackLockedEntryId = ''
  playbackLockedEntryPage = -1
  playbackLockedEntryTick = -1
  playbackPlaybackEntryResetReason = reason
}

function advancePlaybackEntryLock(currentTick: number, safePage: number): PlaybackElementIndexEntry | null {
  const index = buildPlaybackElementIndexIfNeeded()
  const pageEntries = index.entries.filter((entry) => entry.page === safePage)
  if (!pageEntries.length) return null
  const firstIndex = pageEntries[0].order

  let candidate = pageEntries[0]
  for (const entry of pageEntries) {
    if (entry.order <= Math.max(playbackLockedEntryIndex, firstIndex)) {
      candidate = entry
      continue
    }
    if (playbackLockedEntryIndex >= 0 && entry.order < playbackLockedEntryIndex) continue
    if (playbackLockedEntryTick >= 0 && currentTick < playbackLockedEntryTick) continue
    candidate = entry
    break
  }

  if (playbackLockedEntryIndex < 0) {
    playbackLockedEntryIndex = candidate.order
    playbackLockedEntryId = candidate.id
    playbackLockedEntryPage = candidate.page
    playbackLockedEntryTick = currentTick
    playbackPlaybackEntryResetReason = 'init'
    return candidate
  }

  if (candidate.order < playbackLockedEntryIndex && safePage === playbackLockedEntryPage) {
    return index.idToEntry.get(playbackLockedEntryId) ?? candidate
  }

  if (candidate.order > playbackLockedEntryIndex || safePage !== playbackLockedEntryPage) {
    playbackLockedEntryIndex = candidate.order
    playbackLockedEntryId = candidate.id
    playbackLockedEntryPage = candidate.page
    playbackLockedEntryTick = currentTick
    playbackPlaybackEntryResetReason = safePage !== playbackLockedEntryPage ? 'page-turn' : 'seek'
    return candidate
  }

  return index.idToEntry.get(playbackLockedEntryId) ?? candidate
}

function getBestPlaybackIndicatorPage(semanticMapped: { page: number; progress: number } | null, mappedPage: number): number {
  const safeMappedPage = Math.max(1, Math.min(totalPages.value, Math.floor(mappedPage || 1)))
  if (!semanticMapped) return safeMappedPage
  if (!playbackSemanticPageReliable) return safeMappedPage
  // 只在语义页码与准确页码完全一致时接受语义结果，避免多页跳转导致的提前/延后翻页。
  if (semanticMapped.page === safeMappedPage) {
    return Math.max(1, Math.min(totalPages.value, semanticMapped.page))
  }
  return safeMappedPage
}

function getPlaybackPageFlipThreshold(page: number): number {
  const safePage = Math.max(1, Math.min(totalPages.value, Math.floor(page || 1)))
  const pageBoundary = playbackPageBoundaries.value[safePage - 1]
  if (!Number.isFinite(pageBoundary)) {
    const maxPages = Math.max(1, totalPages.value)
    if (safePage >= maxPages) return 1
    const linearBoundary = safePage / maxPages
    return linearBoundary
  }
  const previousBoundary = safePage > 1 ? playbackPageBoundaries.value[safePage - 2] ?? 0 : 0
  const span = Math.max(1e-9, pageBoundary - previousBoundary)
  // 翻页阈值后移一点点，优先保证“看起来到页尾了再翻页”，避免过早切页。
  return Math.max(previousBoundary + span * 0.86, pageBoundary - 0.006)
}

/** 是否处于曲首附近（用于允许从后面几页翻回第 1 页）。 */
function isPlaybackAtScoreStart(currentTick: number): boolean {
  if (currentTick <= 0) return true
  const total = currentMidiTotalTicks.value
  if (total <= 0) return false
  return currentTick <= Math.max(1, Math.floor(total * 0.002))
}

/**
 * 翻页模式是否应自动切到 safePage。
 * OSMD：页码来自小节分页，与全局 progress（Verovio 语义表 / 线性 tick）不同源，仅看 safePage 前进。
 * Verovio：仍要求 progress 达到当前页 flipThreshold，避免 timemap 页码超前于听感。
 * 曲首播放时允许 safePage 小于 currentPageNum（用户在后面几页点「播放」需回到第 1 页）。
 */
function shouldAutoFlipPlaybackPage(
  currentPageNum: number,
  safePage: number,
  progress: number,
  flipThreshold: number,
  currentTick: number,
  osmdPlaybackHit: OsmdPlaybackCursorHit | null,
): boolean {
  if (currentTick < lastStablePlaybackTick) return false
  if (safePage === currentPageNum) return false
  if (safePage < currentPageNum) {
    return isPlaybackAtScoreStart(currentTick)
  }
  if (renderEngine.value === 'osmd' && osmdPlaybackHit) return true
  return progress >= flipThreshold
}

/** 从头播放前：页码/滚动位置/指示线布局与 tick 对齐到曲首。 */
async function resetPlaybackViewForFreshStart() {
  lastStablePlaybackTick = 0
  currentPlaybackTick.value = 0
  playbackIndicatorScrollMeasuredPage = 0
  playbackIndicatorSystemsLayout.value = null
  playbackIndicatorSystemsLayoutMeasuredPage = -1
  playbackActiveSystemPage = -1
  playbackActiveSystemIndex = 0
  resetPlaybackEntryLock('init')
  playbackPlaybackEntryResetReason = 'init'

  if (totalPages.value > 0) {
    currentPage.value = 1
    pageDraft.value = '1'
  }

  if (viewMode.value === 'scroll') {
    resetScrollPlaybackFollowState()
    const scrollEl = await getScoreScrollElement()
    if (scrollEl) {
      lastProgrammaticScrollTop = 0
      scrollEl.scrollTop = 0
    }
  }

  await nextTick()
  if (viewMode.value === 'page') {
    scheduleRefreshPlaybackStaffLayout()
  }
}

function showPageFlipFlash(from: number, to: number) {
  if (!orchestraAlignmentDebugUiEnabled || from === to || from <= 0 || to <= 0) return
  pageFlipFlashText.value = `Page ${from} -> ${to}`
  pageFlipFlashVisible.value = true
  if (pageFlipFlashTimer !== null) {
    window.clearTimeout(pageFlipFlashTimer)
  }
  pageFlipFlashTimer = window.setTimeout(() => {
    pageFlipFlashVisible.value = false
    pageFlipFlashTimer = null
  }, 650)
}

function cleanupRefreshPlaybackStaffLayoutTimers() {
  refreshPlaybackStaffLayoutPending = false
  if (refreshPlaybackStaffLayoutRafId !== null) {
    window.cancelAnimationFrame(refreshPlaybackStaffLayoutRafId)
    refreshPlaybackStaffLayoutRafId = null
  }
  if (refreshPlaybackStaffLayoutTimerId !== null) {
    window.clearTimeout(refreshPlaybackStaffLayoutTimerId)
    refreshPlaybackStaffLayoutTimerId = null
  }
}

const orchestraPlayer = new OrchestraPlayer({
  onPlayingChange: (playing) => {
    orchestraPlaying.value = playing
    if (playing) {
      lastStablePlaybackTick = 0
      orchestraPlaybackPaused.value = false
      resetScrollPlaybackFollowState()
      syncScrollPlaybackFollowInputListeners()
      if (playbackPlaybackEntryResetReason === 'pause-resume') {
        resetPlaybackEntryLock('pause-resume')
      } else if (playbackPlaybackEntryResetReason === 'cleanup') {
        resetPlaybackEntryLock('init')
      }
      if (!orchestraNotePreviewActive.value) {
        startPlaybackCursorLoop()
        void nextTick(() => {
          if (orchestraPlaying.value && !orchestraNotePreviewActive.value) void updatePlaybackCursor()
        })
      }
    } else {
      resetScrollPlaybackFollowState()
      syncScrollPlaybackFollowInputListeners()
      stopPlaybackCursorLoop()
    }
  },
})

const deleteConfirmButtons = [
  {
    text: '取消',
    role: 'cancel' as const,
  },
  {
    text: '确认删除',
    role: 'destructive' as const,
    handler: () => {
      void confirmDeleteCurrentCache()
    },
  },
]

const scrollCombinedHtml = computed(() =>
  pagesSvg.value.map((svg) => `<div class="score-scroll-page-block">${svg}</div>`).join(''),
)

/**
 * 判断缓存 key 是否属于当前渲染引擎。
 * 缓存 key 格式为 `{engine}:{layoutVersion}:{fileHash}`，通过前缀匹配区分不同引擎的缓存。
 * @param cacheKey - IndexedDB 中存储的缓存键
 * @param engine - 当前选中的渲染引擎（'verovio' | 'osmd'）
 * @returns 缓存是否属于当前引擎
 */
function isCacheKeyForEngine(cacheKey: string, engine: ScoreRenderEngine): boolean {
  return cacheKey.startsWith(`${engine}:`)
}

/**
 * 生成当前 Verovio 排版参数的缓存版本签名。
 * 签名包含排版缓存版本号、页面宽度、页眉/页脚开关、主题模式，
 * 任何参数变化都会生成不同的签名，从而触发缓存失效和重新渲染。
 * @returns 格式如 `v3-w2100-hauto-fnone-tdark` 的版本字符串
 */
function getVerovioLayoutVersion(): string {
  const headerTag = verovioShowHeader.value ? 'auto' : 'none'
  const footerTag = verovioShowFooter.value ? 'auto' : 'none'
  return `${VEROVIO_LAYOUT_CACHE_VERSION}-w${verovioPageWidth.value}-h${headerTag}-f${footerTag}-t${effectiveScoreThemeMode.value}`
}

/** OSMD 分页缓存版本：基于手动 tenths 与谱面明暗 */
function getOsmdLayoutVersionForXml(): string {
  const theme = effectiveScoreThemeMode.value
  const orchTag = osmdOrchestralOneSystemLayout.value?.applied ? '-orch1sys' : ''
  return `${VEROVIO_LAYOUT_CACHE_VERSION}-osmd-paged-v10-manual-${osmdManualPageWidthTenths.value}x${osmdManualPageHeightTenths.value}${orchTag}-t${theme}`
}

/** 与 `renderMusicXmlWithOsmdPages` 一致的 OSMD 渲染参数（手动 tenths → mm）。 */
function buildOsmdRenderOptions(musicXml: string) {
  const base = {
    paged: true as const,
    scoreTheme: effectiveScoreThemeMode.value,
    useMusicXmlPageDimensions: false,
    preferOneSystemPerPage: false,
    pageWidthTenths: osmdManualPageWidthTenths.value,
    pageHeightTenths: osmdManualPageHeightTenths.value,
  }
  const resolved = mergeOsmdPageFormatOptions(musicXml, base)
  return {
    ...base,
    layoutHostWidthPx: resolveOsmdLayoutHostWidthPx(resolved.pageWidth),
  }
}

/** 打开乐谱：按 MusicXML `<page-layout>` 的 page-width / page-height 分页，不改写 XML。 */
function buildOsmdRenderOptionsFromFile(musicXml: string) {
  const base = {
    paged: true as const,
    scoreTheme: effectiveScoreThemeMode.value,
    useMusicXmlPageDimensions: true,
    preferOneSystemPerPage: true,
  }
  const resolved = mergeOsmdPageFormatOptions(musicXml, base)
  return {
    ...base,
    layoutHostWidthPx: resolveOsmdLayoutHostWidthPx(resolved.pageWidth),
  }
}

function normalizePlaybackPageBoundaries(
  boundaries: unknown,
  totalPages: number,
): number[] {
  if (!Array.isArray(boundaries)) return []
  const safePages = Math.max(1, Math.floor(totalPages || 1))
  if (boundaries.length !== safePages) return []
  const normalized: number[] = []
  let prev = 0
  for (let i = 0; i < boundaries.length; i += 1) {
    const raw = Number(boundaries[i])
    if (!Number.isFinite(raw)) return []
    const clamped = Math.max(0, Math.min(1, raw))
    // 边界必须严格递增；若出现大量重复/平铺值，说明 timemap 页信息不可靠。
    if (i > 0 && clamped <= prev + 1e-6) return []
    normalized.push(clamped)
    prev = clamped
  }
  // 第 1 页边界过小通常意味着所有页都被压在极小区间（会导致播放初期疯狂跳页）。
  const minReasonableFirstBoundary = 1 / Math.max(12, safePages * 6)
  if (normalized[0] < minReasonableFirstBoundary) return []
  // 末页边界过小通常代表 timemap 异常，回退到线性映射更稳妥。
  if (normalized[normalized.length - 1] < 0.98) return []
  return normalized
}

function normalizePlaybackSystemBoundariesByPage(
  rawByPage: unknown,
  pageBoundaries: number[],
  totalPages: number,
): number[][] {
  if (!Array.isArray(rawByPage)) return []
  const safePages = Math.max(1, Math.floor(totalPages || 1))
  const safePageBoundaries = pageBoundaries.length === safePages ? pageBoundaries : []
  if (safePageBoundaries.length !== safePages) return []

  const out: number[][] = []
  for (let pageIdx = 0; pageIdx < safePages; pageIdx += 1) {
    const pageStart = pageIdx === 0 ? 0 : safePageBoundaries[pageIdx - 1]
    const pageEnd = safePageBoundaries[pageIdx] ?? 1
    const denom = pageEnd - pageStart
    const raw = rawByPage[pageIdx]

    if (!Array.isArray(raw) || raw.length === 0 || denom <= 1e-9) {
      out.push([1])
      continue
    }

    const normalized: number[] = []
    let prev = 0
    for (let i = 0; i < raw.length; i += 1) {
      const t = Number(raw[i])
      if (!Number.isFinite(t)) continue
      const local = denom > 0 ? (t - pageStart) / denom : 0
      const clamped = Math.max(0, Math.min(1, local))
      if (i > 0 && clamped <= prev + 1e-6) continue
      normalized.push(clamped)
      prev = clamped
    }

    if (normalized.length === 0) {
      out.push([1])
      continue
    }
    normalized[normalized.length - 1] = 1
    out.push(normalized)
  }
  return out
}

function buildSystemBoundaryProgressFromLayouts(measuredSystems: PlaybackSystemLayout[]): number[] {
  if (!Array.isArray(measuredSystems) || measuredSystems.length === 0) return [1]
  if (measuredSystems.length === 1) return [1]

  // 注意：bottomPx 是“到容器底部的距离”，不是 system 高度；
  // 若用 topPx + bottomPx 会把边界压缩到接近 1，导致 system/page 过早切换。
  const sortedTop = measuredSystems
    .map((sys) => Number(sys.topPx))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)
  if (sortedTop.length < 2) return [1]
  const topMost = sortedTop[0]
  const bottomMost = sortedTop[sortedTop.length - 1]
  const totalSpan = bottomMost - topMost
  if (!Number.isFinite(totalSpan) || totalSpan <= 1e-9) {
    return measuredSystems.slice(0, -1).map((_, idx) => (idx + 1) / measuredSystems.length)
  }

  const boundaries = sortedTop.slice(0, -1).map((currentTop, idx) => {
    const nextTop = sortedTop[idx + 1]
    const boundaryY = currentTop + (nextTop - currentTop) / 2
    return Math.max(0, Math.min(1, (boundaryY - topMost) / totalSpan))
  })

  const out: number[] = []
  let prev = 0
  for (const boundary of boundaries) {
    const v = Math.max(prev + 1e-6, Math.min(1, boundary))
    out.push(v)
    prev = v
  }
  return out.length > 0 ? out : [1]
}

/**
 * 将缓存记录恢复到当前页面状态。
 * 从 IndexedDB 读取的缓存数据还原到所有响应式状态中，包括：
 * SVG 页面数组、文件名、标注列表、源格式、当前页码、可导出的 MusicXML 等。
 * 同时会清除正在进行的播放状态，收起标注面板。
 * @param options.hadFlsUiCommentInOpenedFile - 本次若从磁盘读取了 XML，是否检测到文件头注释（与缓存字段取或）
 */
function applyCachedState(
  cached: ScoreCacheRecord,
  options: { hadFlsUiCommentInOpenedFile?: boolean } = {},
) {
  annotationPanelExpanded.value = false
  clearOrchestraPlaybackState()
  pagesSvg.value = cached.pagesSvg
  fileName.value = cached.fileName
  selectedCacheKey.value = cached.cacheKey
  currentLayoutVersion.value = cached.layoutVersion
  annotations.value = Array.isArray(cached.annotations) ? normalizeAnnotationRecords(cached.annotations) : []
  // 从缓存恢复时也保留可标注能力（按文件扩展名判断）。
  currentSourceFormat.value = getSourceFormatByName(cached.fileName)
  const xmlFromCache = cached.musicXmlForExport?.trim() ?? ''
  currentVerovioSourceXml.value = xmlFromCache
  if (xmlFromCache.length > 0) {
    restoreOsmdOrchestralLayoutHintFromCache(xmlFromCache, cached.layoutVersion)
  } else {
    applyOsmdOrchestralLayoutState(null)
  }
  currentScoreXmlForExport.value =
    canAnnotateInFileFormat.value && xmlFromCache.length > 0 ? xmlFromCache : ''
  const pages = cached.pagesSvg.length
  const restoredPage = pages > 0 ? Math.max(1, Math.min(cached.currentPage, pages)) : 1
  currentPage.value = restoredPage
  pageDraft.value = String(restoredPage)
  // 恢复页面边界数据（旧缓存可能无此字段）
  playbackPageBoundaries.value = normalizePlaybackPageBoundaries(cached.pageBoundaryProgress, pages)
  playbackSemanticRows.value = Array.isArray(cached.semanticPlaybackRows)
    ? cached.semanticPlaybackRows
        .map((row) => ({
          tickStart: Number(row.tickStart),
          tickEnd: Number(row.tickEnd),
          progressStart: Number(row.progressStart),
          progressEnd: Number(row.progressEnd),
          page: Number(row.page),
          system: Number(row.system),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.tickStart) &&
            Number.isFinite(row.tickEnd) &&
            row.tickEnd > row.tickStart &&
            Number.isFinite(row.progressStart) &&
            Number.isFinite(row.progressEnd),
        )
    : []
  // 恢复页内 system 边界数据（旧缓存可能无此字段）
  const cachedSystemBounds = cached.systemBoundaryProgressByPage
  if (
    Array.isArray(cachedSystemBounds) &&
    cachedSystemBounds.length === pages &&
    cachedSystemBounds.every((arr) => Array.isArray(arr) && arr.every((v) => Number.isFinite(v)))
  ) {
    playbackSystemBoundariesByPage.value = cachedSystemBounds.map((arr) =>
      (arr as number[]).map((v) => Math.max(0, Math.min(1, v))),
    )
  }
  orchestraDebugLog('info', '[orchestra-debug] restore boundaries', {
    pages,
    boundariesLen: playbackPageBoundaries.value.length,
    boundaries: playbackPageBoundaries.value,
    semanticRows: playbackSemanticRows.value.length,
    systemBoundariesLen: playbackSystemBoundariesByPage.value.length,
  })
  const ob = cached.osmdPageMeasureIndexBounds
  osmdPageMeasureIndexBounds.value =
    Array.isArray(ob) &&
    ob.length === pages &&
    ob.every((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end >= b.start)
      ? ob.map((b) => ({ start: Math.round(b.start), end: Math.round(b.end) }))
      : []
  osmdPageMeasureInkNormSpans.value =
    normalizeOsmdPageMeasureInkNormSpans(cached.osmdPageMeasureInkNormSpans, pages) ?? []
  const sysBounds = cached.osmdPageMusicSystemNormBounds
  osmdPageMusicSystemNormBounds.value =
    Array.isArray(sysBounds) &&
    sysBounds.length === pages &&
    sysBounds.every(
      (row) =>
        Array.isArray(row) &&
        row.every(
          (b) =>
            Number.isFinite(b.top) &&
            Number.isFinite(b.bottom) &&
            b.bottom > b.top,
        ),
    )
      ? sysBounds.map((row) => row.map((b) => ({ top: Number(b.top), bottom: Number(b.bottom) })))
      : []
  const fromOpenedFile = options.hadFlsUiCommentInOpenedFile === true
  const fromRecord = cached.hadFlsUiCommentOnOpen === true
  scoreOpenedWithFlsUiComment.value = fromOpenedFile || fromRecord

  const midiSnapshot = getScoreCacheMidiSnapshot(cached)
  if (midiSnapshot) {
    applyScoreCacheMidiSnapshot(midiSnapshot)
    orchestraDebugLog('info', '[orchestra-debug] restore midi cache', {
      midiBase64Len: midiSnapshot.midiBase64.length,
      midiTotalTicks: midiSnapshot.midiTotalTicks,
      midiTotalMs: currentMidiTotalMs.value,
      hasTempoMap: !!midiTempoMap.value,
    })
  }
}

/** 将 IndexedDB 中的 MIDI 快照恢复到内存，供播放准备跳过 Verovio renderToMIDI。 */
function applyScoreCacheMidiSnapshot(snapshot: ScoreCacheMidiSnapshot) {
  currentMidiBase64.value = snapshot.midiBase64
  currentMidiTotalTicks.value = snapshot.midiTotalTicks
  const cachedTempo = snapshot.midiTempoMap
  midiTempoMap.value = cachedTempo
    ? {
        ppq: cachedTempo.ppq,
        events: cachedTempo.events.map((ev) => ({
          tick: ev.tick,
          microSecondsPerQN: ev.microSecondsPerQN,
        })),
      }
    : parseMidiTempoMap(snapshot.midiBase64)
  const cachedMs = Math.max(0, Math.floor(Number(snapshot.midiTotalMs) || 0))
  if (cachedMs > 0) {
    currentMidiTotalMs.value = cachedMs
  } else if (midiTempoMap.value && snapshot.midiTotalTicks > 0) {
    currentMidiTotalMs.value = ticksToMilliseconds(
      snapshot.midiTotalTicks,
      midiTempoMap.value.ppq,
      midiTempoMap.value.events,
    )
  } else {
    currentMidiTotalMs.value = 0
  }
}

/** 当前内存中的 MIDI 状态，用于写入乐谱 IndexedDB 缓存。 */
function buildScoreCacheMidiFieldsFromMemory(): ScoreCacheMidiSnapshot | undefined {
  return normalizeScoreCacheMidiFields({
    midiBase64: currentMidiBase64.value,
    midiTotalTicks: currentMidiTotalTicks.value,
    midiTotalMs: currentMidiTotalMs.value,
    midiTempoMap: midiTempoMap.value
      ? {
          ppq: midiTempoMap.value.ppq,
          events: midiTempoMap.value.events.map((ev) => ({
            tick: ev.tick,
            microSecondsPerQN: ev.microSecondsPerQN,
          })),
        }
      : undefined,
  })
}

/**
 * 统一处理缓存读写失败提示。
 * 提取错误原因并拼接友好的中文提示，包含存储配额不足的检测。
 * 只在当前没有其他错误时设置 error 状态，避免覆盖先前的错误信息。
 * @param action - 失败操作名称（如 "写入"、"更新"、"读取"）
 * @param cause - 捕获的异常对象
 */
function handleCacheFailure(action: string, cause: unknown) {
  const reason = cause instanceof Error ? cause.message : String(cause)
  const reasonLower = reason.toLowerCase()
  const quotaHint =
    reasonLower.includes('quota') || reasonLower.includes('storage')
      ? '（可能是浏览器存储空间不足，或单份乐谱 SVG 体积过大）'
      : ''
  const message = `缓存${action}失败：${reason}${quotaHint}`
  console.error('[score-cache]', action, cause)
  if (!error.value) {
    error.value = message
  }
}

/**
 * 统一记录页面内部捕获的异常。
 * 使用 `[home-page]` 前缀便于在控制台中过滤和定位。
 * @param context - 发生异常的上下文描述
 * @param cause - 捕获的异常对象
 */
function logCaught(context: string, cause: unknown) {
  console.error(`[home-page] ${context}`, cause)
}

/**
 * 通过文件名后缀推断乐谱源格式。
 * 支持 .musicxml、.xml、.mxl、.mei 等常见后缀。
 * @param name - 文件名（含扩展名）
 * @returns 识别到的源格式，无法识别时返回 'unknown'
 */
function getSourceFormatByName(name: string): 'musicxml' | 'mxl' | 'mei' | 'unknown' {
  const lower = name.normalize('NFKC').trim().toLowerCase()
  if (lower.endsWith('.musicxml') || lower.endsWith('.xml')) return 'musicxml'
  if (lower.endsWith('.mxl')) return 'mxl'
  if (lower.endsWith('.mei')) return 'mei'
  return 'unknown'
}

/**
 * 通过 MIME 类型推断乐谱源格式。
 * 作为 iPad/Safari 等场景下文件名缺失或异常的兜底方案。
 * MEI 格式通过 MIME 中包含 "mei" 判断；
 * MusicXML 通过 application/xml、text/xml、+xml 后缀判断；
 * MXL 通过 application/zip 判断。
 * @param type - 文件的 MIME 类型字符串
 * @returns 识别到的源格式，无法识别时返回 'unknown'
 */
function getSourceFormatByMime(type: string): 'musicxml' | 'mxl' | 'mei' | 'unknown' {
  const t = type.trim().toLowerCase()
  if (!t) return 'unknown'
  if (t.includes('mei')) return 'mei'
  if (t.includes('musicxml') || t === 'application/xml' || t === 'text/xml' || t.endsWith('+xml')) {
    return 'musicxml'
  }
  if (t.includes('zip')) return 'mxl'
  return 'unknown'
}

/**
 * 通过扩展名 → MIME → 文件头魔数三级策略综合探测乐谱源格式。
 * 1. 优先从文件名后缀判断；
 * 2. 其次从 MIME 类型判断；
 * 3. 最后读取文件前 2048 字节检测魔数（ZIP PK头 → MXL，XML 声明 → MusicXML，MEI 标签 → MEI）。
 * @param file - 用户选择的文件对象
 * @returns 探测到的源格式
 */
async function detectSourceFormat(file: File): Promise<'musicxml' | 'mxl' | 'mei' | 'unknown'> {
  const byName = getSourceFormatByName(file.name)
  if (byName !== 'unknown') return byName

  const byMime = getSourceFormatByMime(file.type)
  if (byMime !== 'unknown') return byMime

  try {
    const probe = new Uint8Array(await file.slice(0, 2048).arrayBuffer())
    // ZIP 魔数：PK\x03\x04（.mxl）
    if (probe.length >= 4 && probe[0] === 0x50 && probe[1] === 0x4b && probe[2] === 0x03 && probe[3] === 0x04) {
      return 'mxl'
    }
    const text = new TextDecoder('utf-8').decode(probe).replace(/^\uFEFF/, '').trimStart().toLowerCase()
    if (text.startsWith('<mei') || text.includes('<mei ')) return 'mei'
    if (
      text.startsWith('<?xml') ||
      text.startsWith('<score-partwise') ||
      text.startsWith('<score-timewise')
    ) {
      return 'musicxml'
    }
  } catch {
    // 忽略探测异常，最终返回 unknown
  }
  return 'unknown'
}

/**
 * 将当前内存中的页面 SVG、标注、页码等状态写回 IndexedDB 缓存。
 * 仅在已选中缓存键、有页面数据、有排版版本号时执行。
 * 写入失败不阻断主流程，但通过 handleCacheFailure 展示错误。
 */
async function persistCurrentCacheState() {
  if (!selectedCacheKey.value || !pagesSvg.value.length || !currentLayoutVersion.value) return
  try {
    await putScoreCache({
      cacheKey: selectedCacheKey.value,
      fileName: fileName.value,
      pagesSvg: pagesSvg.value,
      totalPages: pagesSvg.value.length,
      viewMode: viewMode.value as ScoreViewMode,
      currentPage: currentPage.value,
      annotations: annotations.value,
      ...(currentScoreXmlForExport.value.trim().length > 0
        ? { musicXmlForExport: currentScoreXmlForExport.value }
        : {}),
      ...(playbackPageBoundaries.value.length === pagesSvg.value.length
        ? { pageBoundaryProgress: playbackPageBoundaries.value }
        : {}),
      ...(playbackSystemBoundariesByPage.value.length === pagesSvg.value.length
        ? { systemBoundaryProgressByPage: playbackSystemBoundariesByPage.value }
        : {}),
      ...(renderEngine.value === 'osmd' &&
      osmdPageMeasureIndexBounds.value.length === pagesSvg.value.length
        ? { osmdPageMeasureIndexBounds: osmdPageMeasureIndexBounds.value }
        : {}),
      ...(renderEngine.value === 'osmd' &&
      osmdPageMeasureInkNormSpans.value.length === pagesSvg.value.length
        ? { osmdPageMeasureInkNormSpans: osmdPageMeasureInkNormSpans.value }
        : {}),
      ...(renderEngine.value === 'osmd' &&
      osmdPageMusicSystemNormBounds.value.length === pagesSvg.value.length
        ? { osmdPageMusicSystemNormBounds: osmdPageMusicSystemNormBounds.value }
        : {}),
      semanticPlaybackRows: playbackSemanticRows.value,
      layoutVersion: currentLayoutVersion.value,
      hadFlsUiCommentOnOpen: scoreOpenedWithFlsUiComment.value,
      ...(buildScoreCacheMidiFieldsFromMemory() ?? {}),
    })
  } catch (e) {
    // 缓存失败不阻断主流程，但需要可见错误便于排查。
    handleCacheFailure('更新', e)
  }
}

/**
 * 对频繁变更做 180ms 短延迟合并写入 IndexedDB。
 * 每次调用会重置计时器，确保在连续操作（如快速标注、翻页）中
 * 只做一次最终写入，大幅降低 IndexedDB 写入频率。
 */
function schedulePersistCurrentCacheState() {
  if (persistCacheTimer !== null) {
    window.clearTimeout(persistCacheTimer)
  }
  persistCacheTimer = window.setTimeout(() => {
    void persistCurrentCacheState()
    persistCacheTimer = null
  }, 180)
}

/**
 * 刷新缓存文件列表并修正当前选中项。
 * 如果当前选中的缓存键不属于当前渲染引擎，则自动清除选中状态。
 * 如果没有选中项但有可用缓存，自动选中第一个。
 */
async function refreshCachedFiles() {
  try {
    cachedFiles.value = await listScoreCacheSummaries()
    if (
      selectedCacheKey.value &&
      !isCacheKeyForEngine(selectedCacheKey.value, renderEngine.value)
    ) {
      selectedCacheKey.value = ''
    }
    if (!selectedCacheKey.value && filteredCachedFiles.value.length > 0) {
      selectedCacheKey.value = filteredCachedFiles.value[0].cacheKey
    }
  } catch (e) {
    logCaught('refreshCachedFiles failed', e)
    cachedFiles.value = []
  }
}

/**
 * 打开指定缓存键对应的乐谱并恢复到 UI 状态。
 * 从 IndexedDB 读取完整缓存记录，调用 applyCachedState 还原所有状态，
 * 同时记录该缓存为最近打开的缓存。
 * @param cacheKey - 要恢复的缓存键
 */
async function openCachedByKey(cacheKey: string) {
  if (!cacheKey) return
  loading.value = true
  scoreLoadingStageIndex.value = 1
  error.value = ''
  try {
    await nextTick()
    const cached = await getScoreCache(cacheKey)
    if (!cached?.pagesSvg?.length) {
      await refreshCachedFiles()
      return
    }
    await setScoreLoadingStage(4)
    applyCachedState(cached)
    await setLastOpenedCacheKey(cacheKey)
    await refreshCachedFiles()
  } catch (e) {
    logCaught('openCachedByKey failed', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    clearScoreLoadingStage()
  }
}

/**
 * 缓存列表项点击回调。
 * 更新选中缓存键并从 IndexedDB 加载对应乐谱。
 * @param value - 选中的缓存键
 */
async function onCachedFileSelect(value: string) {
  selectedCacheKey.value = value
  await openCachedByKey(value)
}

/**
 * 切换渲染引擎后的处理逻辑。
 * 先刷新缓存列表（以获取新引擎的缓存），
 * 若有该引擎的缓存则直接恢复，否则清空所有页面状态。
 * @param value - 目标渲染引擎标识（'verovio' | 'osmd'）
 */
async function onRenderEngineSelect(value: string) {
  const engine = value as ScoreRenderEngine
  if (engine !== 'osmd' && engine !== 'verovio') return
  renderEngine.value = engine
  await refreshCachedFiles()

  // 切换引擎后优先恢复该引擎最近缓存，避免刷新后落到另一引擎结果
  if (selectedCacheKey.value) {
    await openCachedByKey(selectedCacheKey.value)
    return
  }

  pagesSvg.value = []
  osmdPageMeasureIndexBounds.value = []
  osmdPageMeasureInkNormSpans.value = []
  osmdPageMusicSystemNormBounds.value = []
  pageInkClientRects.value = []
  clearOrchestraPlaybackState()
  fileName.value = ''
  annotations.value = []
  currentScoreXmlForExport.value = ''
  currentVerovioSourceXml.value = ''
  currentSourceFormat.value = 'unknown'
  currentPage.value = 1
  pageDraft.value = '1'
  scoreUiStore.resetAnnotationPresentationForNewScore()
  annotationPanelExpanded.value = false
  scoreOpenedWithFlsUiComment.value = false
}

/**
 * 更新 Verovio 页面宽度，夹紧到 600~10000 范围后写入 Pinia store。
 * @param value - 用户输入的页面宽度（px）
 */
function onVerovioPageWidthChange(value: number) {
  if (!Number.isFinite(value)) return
  scoreUiStore.setVerovioPageWidth(value)
}

function onOsmdUseFilePageDimensionsChange(value: boolean) {
  scoreUiStore.setOsmdUseFilePageDimensions(value)
}

function onOsmdManualPageWidthTenthsChange(value: number) {
  if (!Number.isFinite(value)) return
  scoreUiStore.setOsmdManualPageWidthTenths(value)
}

function onOsmdManualPageHeightTenthsChange(value: number) {
  if (!Number.isFinite(value)) return
  scoreUiStore.setOsmdManualPageHeightTenths(value)
}

/**
 * 更新 Verovio 页眉显示开关，写入 Pinia store 持久化。
 * @param value - 是否显示页眉
 */
function onVerovioShowHeaderChange(value: boolean) {
  scoreUiStore.setVerovioShowHeader(value)
}

/**
 * 更新 Verovio 页脚显示开关，写入 Pinia store 持久化。
 * @param value - 是否显示页脚
 */
function onVerovioShowFooterChange(value: boolean) {
  scoreUiStore.setVerovioShowFooter(value)
}

/**
 * 手动切换谱面颜色主题（亮色/暗色）。
 * 不跟随系统 / iPad 深色模式，仅由用户在文件工具中切换。
 * 切换后由 `watch(effectiveScoreThemeMode)` 触发 Verovio/OSMD 重新渲染。
 */
function toggleScoreThemeMode() {
  manualScoreThemeMode.value = manualScoreThemeMode.value === 'dark' ? 'light' : 'dark'
}

/** 先让全屏 loading 挂上 DOM 并交出至少两帧 + 一次 macrotask，再跑排版（避免与 Transition 或同步解析抢同一帧）。 */
async function flushLoadingOverlayPaint() {
  await nextTick()
  await new Promise<void>((r) => setTimeout(r, 0))
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function setScoreLoadingStage(n: number) {
  scoreLoadingStageIndex.value = n
  await nextTick()
}

function clearScoreLoadingStage() {
  scoreLoadingStageIndex.value = undefined
}

/**
 * 将当前 OSMD 参数（离屏页面宽度等）应用到已打开的乐谱。
 * 从缓存的源 MusicXML 重新分页渲染，并更新 bounds / ink span 与 IndexedDB 缓存键。
 */
async function applyOsmdLayoutToCurrentScore() {
  if (renderEngine.value !== 'osmd' || !pagesSvg.value.length || loading.value) return
  applyOsmdOrchestralLayoutState(null)
  const xml = (currentVerovioSourceXml.value || currentScoreXmlForExport.value).trim()
  if (!xml) {
    error.value = '当前乐谱缺少可重排的源数据，请重新打开文件后再应用排版'
    return
  }

  if (scoreOpenedWithFlsUiComment.value) {
    const ok = window.confirm(
      '检测到该乐谱含有导出时的排版元数据（二次打开）。多次修改 OSMD 渲染宽度可能导致已有标注位置错乱，请谨慎修改。\n\n仍要继续应用排版吗？',
    )
    if (!ok) return
  }

  const fileLayout = extractMusicXmlPageLayout(xml)
  if (fileLayout) {
    const w = osmdManualPageWidthTenths.value
    const h = osmdManualPageHeightTenths.value
    const tooShort = h < fileLayout.heightTenths * 0.9
    const tooNarrow = w < fileLayout.widthTenths * 0.9
    if (tooShort || tooNarrow) {
      const mm = pageLayoutTenthsToMm(w, h, xml)
      const lines: string[] = [
        '当前纸张明显小于乐谱文件中的默认 page-layout，OSMD 可能无法在单页放下一个 system（控制台 PageFormat too small 警告）。',
        '',
        `当前：${w} × ${h} tenths（约 ${mm.widthMm} × ${mm.heightMm} mm）`,
        `默认：${fileLayout.widthTenths} × ${fileLayout.heightTenths} tenths（约 ${fileLayout.widthMm} × ${fileLayout.heightMm} mm）`,
      ]
      if (tooShort) {
        lines.push('', '管弦乐总谱请优先增大「页面高度」；若要放大页面，数值应大于默认而非更小。')
      }
      lines.push('', '仍要继续应用排版吗？')
      if (!window.confirm(lines.join('\n'))) return
    }
  }

  const inkFractionSnapshots =
    osmdPageMeasureInkNormSpans.value.length > 0 &&
    osmdPageMeasureIndexBounds.value.length > 0 &&
    annotations.value.some((a) => a.anchorMeasureListIndex0 != null && a.anchorMeasureListIndex0 >= 0)
      ? snapshotOsmdAnnotationMeasureInkFractions(
          annotations.value,
          osmdPageMeasureInkNormSpans.value,
          containerNormXYToInkNormForAnnotation,
        )
      : null

  loading.value = true
  scoreLoadingStageIndex.value = 3
  error.value = ''
  await flushLoadingOverlayPaint()
  try {
    const osmdPaged = await renderMusicXmlWithOsmdPages(xml, buildOsmdRenderOptions(xml))
    applyOsmdOrchestralLayoutState(osmdPaged.orchestralOneSystemLayout)
    const pages = osmdPaged.pages
    if (!pages.length) {
      throw new Error('应用排版后未生成任何页面')
    }

    pagesSvg.value = pages
    osmdPageMeasureIndexBounds.value = osmdPaged.pageMeasureIndexBounds
    osmdPageMeasureInkNormSpans.value = osmdPaged.pageMeasureInkNormSpans
    osmdPageMusicSystemNormBounds.value = osmdPaged.pageMusicSystemNormBounds
    currentVerovioSourceXml.value = xml

    await realignOsmdAnnotationsToCurrentLayout(inkFractionSnapshots)

    currentPage.value = 1
    pageDraft.value = '1'

    const nextLayoutVersion = getOsmdLayoutVersionForXml()
    currentLayoutVersion.value = nextLayoutVersion

    const prevCacheKey = selectedCacheKey.value
    let nextCacheKey = selectedCacheKey.value
    if (nextCacheKey.startsWith('osmd:')) {
      const firstColon = nextCacheKey.indexOf(':')
      const secondColon = nextCacheKey.indexOf(':', firstColon + 1)
      if (firstColon >= 0 && secondColon > firstColon) {
        nextCacheKey = `${nextCacheKey.slice(0, firstColon + 1)}${nextLayoutVersion}${nextCacheKey.slice(secondColon)}`
      }
    }
    selectedCacheKey.value = nextCacheKey

    let xmlForCache = currentScoreXmlForExport.value
    if (
      osmdManualPageWidthTenths.value > 0 &&
      osmdManualPageHeightTenths.value > 0 &&
      xmlForCache.trim().length > 0
    ) {
      xmlForCache = patchMusicXmlPageLayoutTenths(
        xmlForCache,
        osmdManualPageWidthTenths.value,
        osmdManualPageHeightTenths.value,
      )
    }

    await setScoreLoadingStage(4)
    await putScoreCache({
      cacheKey: nextCacheKey,
      fileName: fileName.value,
      pagesSvg: pages,
      totalPages: pages.length,
      viewMode: viewMode.value as ScoreViewMode,
      currentPage: currentPage.value,
      annotations: annotations.value,
      ...(xmlForCache.trim().length > 0
        ? { musicXmlForExport: xmlForCache }
        : {}),
      ...(playbackPageBoundaries.value.length === pages.length
        ? { pageBoundaryProgress: playbackPageBoundaries.value }
        : {}),
      ...(playbackSystemBoundariesByPage.value.length === pages.length
        ? { systemBoundaryProgressByPage: playbackSystemBoundariesByPage.value }
        : {}),
      ...(osmdPageMeasureIndexBounds.value.length === pages.length
        ? { osmdPageMeasureIndexBounds: osmdPageMeasureIndexBounds.value }
        : {}),
      ...(osmdPageMeasureInkNormSpans.value.length === pages.length
        ? { osmdPageMeasureInkNormSpans: osmdPageMeasureInkNormSpans.value }
        : {}),
      ...(osmdPageMusicSystemNormBounds.value.length === pages.length
        ? { osmdPageMusicSystemNormBounds: osmdPageMusicSystemNormBounds.value }
        : {}),
      semanticPlaybackRows: playbackSemanticRows.value,
      layoutVersion: nextLayoutVersion,
      hadFlsUiCommentOnOpen: scoreOpenedWithFlsUiComment.value,
    })
    await Promise.all([setLastOpenedCacheKey(nextCacheKey), refreshCachedFiles()])
    if (nextCacheKey !== prevCacheKey) {
      await removeScoreCache(prevCacheKey)
    }
  } catch (e) {
    logCaught('applyOsmdLayoutToCurrentScore failed', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    clearScoreLoadingStage()
  }
}

/**
 * 将当前排版参数应用到已打开的 Verovio 乐谱。
 * 从缓存的源 XML 重新调用 Verovio 渲染引擎生成 SVG 页面，
 * 并更新缓存键以反映新的排版版本。
 */
async function applyVerovioLayoutToCurrentScore() {
  if (renderEngine.value !== 'verovio' || !pagesSvg.value.length || loading.value) return
  const xml = (currentVerovioSourceXml.value || currentScoreXmlForExport.value).trim()
  if (!xml) {
    error.value = '当前乐谱缺少可重排的源数据，请重新打开文件后再应用排版'
    return
  }

  loading.value = true
  scoreLoadingStageIndex.value = 3
  error.value = ''
  await flushLoadingOverlayPaint()
  try {
    const {
      applyScreenLayoutOptions,
      createVerovioToolkit,
      extractPageBoundaryProgress,
      loadMusicXml,
      renderAllPagesSvg,
    } = await import('@/lib/verovio')
    const toolkit = await createVerovioToolkit()
    applyScreenLayoutOptions(toolkit, {
      pageWidth: verovioPageWidth.value,
      header: verovioShowHeader.value ? 'auto' : 'none',
      footer: verovioShowFooter.value ? 'auto' : 'none',
      inkColor: scoreInkColor.value,
    })
    const ok = loadMusicXml(toolkit, xml)
    if (!ok) {
      throw new Error('Verovio 无法按当前参数重新排版该乐谱')
    }
    const pages = renderAllPagesSvg(toolkit)
    if (!pages.length) {
      throw new Error('应用排版后未生成任何页面')
    }

    // 提取每页播放进度边界，用于播放光标精确定位
    const boundaries = extractPageBoundaryProgress(toolkit)
    playbackPageBoundaries.value = normalizePlaybackPageBoundaries(boundaries, pages.length)
    // system 边界与版式强相关：重新排版后需要在播放时重新提取
    playbackSystemBoundariesByPage.value = []
    // 必须与当前 DOM 的 SVG 同源，否则 getElementsAtTime 返回旧版 id，指示线找不到元素。
    displayVerovioToolkit.value = toolkit
    playbackVerovioToolkit.value = toolkit
    rebuildSemanticPlaybackRows(toolkit, xml, 'apply-layout', 0)
    orchestraDebugLog('info', '[orchestra-debug] layout boundaries', {
      pages: pages.length,
      rawLen: boundaries.length,
      normalizedLen: playbackPageBoundaries.value.length,
      boundaries: playbackPageBoundaries.value,
      semanticRows: playbackSemanticRows.value.length,
    })

    pagesSvg.value = pages
    osmdPageMeasureIndexBounds.value = []
    osmdPageMeasureInkNormSpans.value = []
    osmdPageMusicSystemNormBounds.value = []
    pageInkClientRects.value = []
    const nextLayoutVersion = getVerovioLayoutVersion()
    currentLayoutVersion.value = nextLayoutVersion
    if (currentPage.value > pages.length) {
      currentPage.value = pages.length
      pageDraft.value = String(currentPage.value)
    }

    let nextCacheKey = selectedCacheKey.value
    if (nextCacheKey.startsWith('verovio:')) {
      const firstColon = nextCacheKey.indexOf(':')
      const secondColon = nextCacheKey.indexOf(':', firstColon + 1)
      if (firstColon >= 0 && secondColon > firstColon) {
        nextCacheKey = `${nextCacheKey.slice(0, firstColon + 1)}${nextLayoutVersion}${nextCacheKey.slice(secondColon)}`
      }
    }
    selectedCacheKey.value = nextCacheKey

    await setScoreLoadingStage(4)
    await putScoreCache({
      cacheKey: nextCacheKey,
      fileName: fileName.value,
      pagesSvg: pages,
      totalPages: pages.length,
      viewMode: viewMode.value as ScoreViewMode,
      currentPage: currentPage.value,
      annotations: annotations.value,
      ...(currentScoreXmlForExport.value.trim().length > 0
        ? { musicXmlForExport: currentScoreXmlForExport.value }
        : {}),
      ...(playbackPageBoundaries.value.length === pages.length
        ? { pageBoundaryProgress: playbackPageBoundaries.value }
        : {}),
      ...(playbackSystemBoundariesByPage.value.length === pages.length
        ? { systemBoundaryProgressByPage: playbackSystemBoundariesByPage.value }
        : {}),
      semanticPlaybackRows: playbackSemanticRows.value,
      layoutVersion: nextLayoutVersion,
      hadFlsUiCommentOnOpen: scoreOpenedWithFlsUiComment.value,
    })
    await Promise.all([setLastOpenedCacheKey(nextCacheKey), refreshCachedFiles()])
  } catch (e) {
    logCaught('applyVerovioLayoutToCurrentScore failed', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    clearScoreLoadingStage()
  }
}

/**
 * 打开"删除当前缓存"确认弹窗（IonAlert）。
 * 用户需在弹窗中二次确认才执行实际删除操作。
 */
async function onDeleteCurrentCache() {
  deleteConfirmOpen.value = true
}

/**
 * 手动刷新页面（等同于浏览器 F5）。
 * 用于解决缓存不一致或渲染异常时的快速恢复。
 */
function refreshPage() {
  window.location.reload()
}

/**
 * 清空所有 IndexedDB 缓存并重置页面状态。
 * 1. 调用 clearAllScoreCache 清除所有缓存记录
 * 2. 刷新缓存文件列表
 * 3. 停止播放并清除播放状态
 * 4. 清空所有内存中的乐谱/标注/页码状态
 * 5. 关闭确认弹窗
 */
function clearScoreStateAfterCacheRemoval() {
  clearOrchestraPlaybackState()
  selectedCacheKey.value = ''
  pagesSvg.value = []
  osmdPageMeasureIndexBounds.value = []
  osmdPageMeasureInkNormSpans.value = []
  osmdPageMusicSystemNormBounds.value = []
  pageInkClientRects.value = []
  fileName.value = ''
  currentLayoutVersion.value = ''
  annotations.value = []
  currentScoreXmlForExport.value = ''
  currentSourceFormat.value = 'unknown'
  currentVerovioSourceXml.value = ''
  currentPage.value = 1
  pageDraft.value = '1'
  scoreUiStore.resetAnnotationPresentationForNewScore()
  annotationPanelExpanded.value = false
  scoreOpenedWithFlsUiComment.value = false
}

async function confirmDeleteCurrentCache() {
  loading.value = true
  error.value = ''
  try {
    await clearAllScoreCache()
    await refreshCachedFiles()
    clearScoreStateAfterCacheRemoval()
  } catch (e) {
    logCaught('confirmDeleteCurrentCache failed', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    deleteConfirmOpen.value = false
    clearScoreLoadingStage()
  }
}

/**
 * 删除单个缓存文件（由 FileToolPanel 二次确认后触发）。
 * 若删除的是当前打开的乐谱，清空页面状态并尝试打开列表中的下一个缓存。
 */
async function onDeleteCachedFile(cacheKey: string) {
  if (!cacheKey) return
  const wasCurrent = selectedCacheKey.value === cacheKey
  loading.value = true
  error.value = ''
  try {
    await removeScoreCache(cacheKey)
    const lastKey = await getLastOpenedCacheKey()
    if (lastKey === cacheKey) {
      await clearLastOpenedCacheKey()
    }
    await refreshCachedFiles()
    if (!wasCurrent) return

    clearScoreStateAfterCacheRemoval()
    const next = filteredCachedFiles.value[0]
    if (next) {
      selectedCacheKey.value = next.cacheKey
      await openCachedByKey(next.cacheKey)
    }
  } catch (e) {
    logCaught('onDeleteCachedFile failed', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    clearScoreLoadingStage()
  }
}

/**
 * 应用启动时自动恢复上次打开的缓存乐谱。
 * 优先级：lastOpenedCacheKey（Persist） > selectedCacheKey（当前引擎首个缓存）。
 * 仅在 onMounted 生命周期中调用一次。
 * 缓存不可用时静默降级，不影响正常打开文件。
 */
async function restoreLastCachedScore() {
  try {
    await refreshCachedFiles()
    const lastKey = await getLastOpenedCacheKey()
    if (lastKey && isCacheKeyForEngine(lastKey, renderEngine.value)) {
      const cached = await getScoreCache(lastKey)
      if (cached?.pagesSvg?.length) {
        applyCachedState(cached)
        return
      }
    }
    if (selectedCacheKey.value) {
      await openCachedByKey(selectedCacheKey.value)
    }
  } catch (e) {
    logCaught('restoreLastCachedScore failed', e)
    // 缓存不可用时静默降级，不影响正常打开文件
  }
}

/**
 * 组件挂载后的初始化逻辑。
 * 1. 检测 iPad 设备标识
 * 2. 初始化火花粒子画布尺寸
 * 3. 预加载翻页音效
 * 4. 自动恢复上次打开的缓存乐谱
 */
onMounted(() => {
  console.log('onMounted', new Date())
  console.log('dateFormat', dateFormat(new Date(), 'yyyyMMddHHmmss'))
  isiPad.value = detectIpadDevice()
  syncLandscapeViewportState()
  resizeSwipeSparkCanvas()
  window.addEventListener('resize', onWindowResizePlaybackStaffLayout, { passive: true })
  window.addEventListener('resize', bumpAnnotationLayoutEpoch, { passive: true })
  window.addEventListener('dragend', onWindowScoreFileDragEnd, true)
  const audio = new Audio(pageTurningAudioUrl)
  audio.preload = 'auto'
  pageTurnAudioRef.value = audio
  void restoreLastCachedScore()
  syncScrollPlaybackFollowInputListeners()
})

/**
 * 组件卸载前的清理逻辑。
 * 停止播放光标循环、清理火花粒子动画、
 * 释放音频资源和 FluidSynth 播放器。
 */
onBeforeUnmount(() => {
  detachWindowScrollPlaybackFollowListeners()
  detachScoreScrollPlaybackFollowListener()
  resetScrollPlaybackFollowState()
  cachedScoreScrollElement = null
  window.removeEventListener('resize', onWindowResizePlaybackStaffLayout)
  cleanupRefreshPlaybackStaffLayoutTimers()
  window.removeEventListener('resize', bumpAnnotationLayoutEpoch)
  window.removeEventListener('dragend', onWindowScoreFileDragEnd, true)
  stopPlaybackCursorLoop()
  orchestraPlaybackPaused.value = false
  clearPlaybackIndicator()
  stopSwipeSparkLoop()
  swipeSparkParticles = []
  const audio = pageTurnAudioRef.value
  if (audio) {
    audio.pause()
    audio.src = ''
  }
  pageTurnAudioRef.value = null
  if (pageFlipFlashTimer !== null) {
    window.clearTimeout(pageFlipFlashTimer)
    pageFlipFlashTimer = null
  }
  void orchestraPlayer.dispose()
})

/** 切换视图模式时重置缩放和滑动状态。 */
watch(viewMode, (mode) => {
  annotationPanelExpanded.value = false
  if (mode !== 'page') {
    pageViewportZoomed.value = false
    resetSwipeState()
    clearSwipeSparkCanvas()
  }
  if (mode !== 'scroll') {
    resetScrollPlaybackFollowState()
  }
  // 滚动/翻页 DOM 坐标系不同，切换模式时作废指示线布局缓存，避免翻页模式沿用滚动列测量结果。
  playbackIndicatorSystemsLayout.value = null
  playbackIndicatorSystemsLayoutMeasuredPage = -1
  playbackIndicatorScrollMeasuredPage = 0
  playbackActiveSystemPage = -1
  playbackActiveSystemIndex = 0
})

watch(
  () => [viewMode.value, orchestraPlaying.value, pagesSvg.value.length] as const,
  () => {
    syncScrollPlaybackFollowInputListeners()
  },
)

/**
 * 沉浸模式下强制移除 IonContent 的上下偏移，
 * 避免隐藏工具栏后出现白色占位区。
 */
watch(
  immersiveScoreMode,
  (enabled) => {
    syncIonContentOffsets(enabled)
  },
  { immediate: true },
)

/** 进入标注模式时确保 Chrome（工具栏）可见。 */
watch(annotationMode, (enabled) => {
  if (enabled) {
    scoreChromeVisible.value = true
  }
})

/** 页码变化时同步底部输入框草稿值。 */
watch(currentPage, (p, prev) => {
  showPageFlipFlash(prev, p)
  pageDraft.value = String(p)
  if (renderEngine.value === 'osmd') {
    void nextTick().then(() => {
      requestAnimationFrame(() => {
        cacheCurrentPageInkRect()
        bumpAnnotationLayoutEpoch()
      })
    })
  }
})

/** 总页数变化时修正当前页号（防止越界）。 */
watch(totalPages, (n) => {
  if (n > 0 && currentPage.value > n) {
    currentPage.value = n
  }
  if (n === 0) {
    scoreChromeVisible.value = true
    pageViewportZoomed.value = false
  }
})

/** 翻页 / 换源 / 切换视图后重测 SVG 内五线谱水平范围，用于播放指示线对齐。 */
watch([currentPage, viewMode, totalPages], () => {
  scheduleRefreshPlaybackStaffLayout()
})

watch(
  () => (viewMode.value === 'page' ? pagesSvg.value[currentPage.value - 1] : ''),
  () => {
    scheduleRefreshPlaybackStaffLayout()
  },
)

watch(shouldReserveAnnotationPanelSpace, () => {
  scheduleRefreshPlaybackStaffLayout()
})

function onWindowResizePlaybackStaffLayout() {
  syncLandscapeViewportState()
  scheduleRefreshPlaybackStaffLayout()
}

/** 同步当前视口是否为横屏（宽大于高）。 */
function syncLandscapeViewportState() {
  if (typeof window === 'undefined') return
  landscapeViewport.value = window.innerWidth > window.innerHeight
}

/** 系统主题切换时自动重新渲染乐谱（深色/浅色谱面颜色）；Verovio、OSMD 均生效。 */
watch(
  effectiveScoreThemeMode,
  () => {
    if (!pagesSvg.value.length || loading.value) return
    if (renderEngine.value === 'verovio') {
      void applyVerovioLayoutToCurrentScore()
      return
    }
    if (renderEngine.value === 'osmd') {
      void applyOsmdLayoutToCurrentScore()
    }
  },
)

/**
 * 翻到上一页。
 * 翻页时自动收起标注工具面板和文件工具面板，
 * 播放翻页音效，并可选择隐藏顶部/底部 Chrome。
 * @param options.hideChrome - 是否在翻页后隐藏工具栏，默认 false
 */
function goPrev(options: { hideChrome?: boolean } = {}) {
  const hideChrome = options.hideChrome ?? false
  if (currentPage.value > 1) {
    currentPage.value -= 1
    playPageTurnAudio()
    annotationPanelExpanded.value = false
    collapseFileToolPanel()
    if (hideChrome) {
      hideScoreChromeForPageTurn()
    }
    schedulePersistCurrentCacheState()
  }
}

/**
 * 翻到下一页。
 * @param options.hideChrome - 是否在翻页后隐藏工具栏，默认 false
 */
function goNext(options: { hideChrome?: boolean } = {}) {
  const hideChrome = options.hideChrome ?? false
  if (currentPage.value < totalPages.value) {
    currentPage.value += 1
    playPageTurnAudio()
    annotationPanelExpanded.value = false
    collapseFileToolPanel()
    if (hideChrome) {
      hideScoreChromeForPageTurn()
    }
    schedulePersistCurrentCacheState()
  }
}

/**
 * 播放翻页音效（短促的"唰"声）。
 * 仅在翻页音效开关启用且有预加载音频时播放。
 * iOS Safari 自动播放策略可能导致静默失败，不做额外处理。
 */
function playPageTurnAudio() {
  if (!pageTurnSoundEnabled.value) return
  const audio = pageTurnAudioRef.value
  if (!audio) return
  try {
    audio.currentTime = 0
    void audio.play().catch(() => {})
  } catch {
    // iOS 自动播放策略等场景可能失败，静默忽略
  }
}

/**
 * 切换翻页音效开关状态，持久化在内存中（非 Pinia）。
 */
function togglePageTurnSound() {
  pageTurnSoundEnabled.value = !pageTurnSoundEnabled.value
}

function toggleScrollPlaybackAutoFollow() {
  scoreUiStore.toggleScrollPlaybackAutoFollow()
  if (!scoreUiStore.scrollPlaybackAutoFollowEnabled) {
    resetScrollPlaybackFollowState()
    return
  }
  if (viewMode.value === 'scroll' && orchestraPlaying.value) {
    void updatePlaybackCursor()
  }
}

/**
 * 清除所有交响乐播放相关状态。
 * 停止光标动画、停止播放器、清除 MIDI 数据缓存。
 */
function clearOrchestraPlaybackState() {
  stopPlaybackCursorLoop()
  orchestraPlaybackPaused.value = false
  clearPlaybackIndicator()
  orchestraPlayer.stop()
  orchestraPlayer.clearMidi()
  orchestraPlaying.value = false
  currentMidiBase64.value = ''
  currentMidiTotalTicks.value = 0
  currentMidiTotalMs.value = 0
  playbackVerovioToolkit.value = null
  displayVerovioToolkit.value = null
  midiTempoMap.value = null
  playbackPageBoundaries.value = []
  playbackSystemBoundariesByPage.value = []
  playbackSemanticRows.value = []
  playbackElementPageMap = null
  playbackElementPageMapCacheKey = ''
  playbackElementIndex.value = { entries: [], idToEntry: new Map() }
  playbackElementIndexCacheKey.value = ''
  playbackElementIndexResolved.value = false
  lastStablePlaybackTick = 0
  pageFlipFlashVisible.value = false
  pageFlipFlashText.value = ''
  if (pageFlipFlashTimer !== null) {
    window.clearTimeout(pageFlipFlashTimer)
    pageFlipFlashTimer = null
  }
  orchestraResumeEligible = false
  orchestraPlaybackReady.value = false
  orchestraPlaybackLoading.value = false
  orchestraSoundfontSourceHint.value = '未准备'
}

/**
 * 确保 FluidSynth 音色库已加载并就绪。
 * 若已就绪则仅更新提示文字；否则依次加载脚本、Soundfont 并初始化合成器。
 */
async function ensureOrchestraPrepared() {
  const perf = createOrchestraPerfTimer('ensureOrchestraPrepared')
  if (orchestraPlaybackReady.value) {
    orchestraSoundfontSourceHint.value = orchestraPlayer.getSoundfontSourceHint()
    if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[orchestra-prepare]:already-ready', {
        soundfontHint: orchestraSoundfontSourceHint.value,
        hasDisplayToolkit: !!displayVerovioToolkit.value,
        hasSourceXml: currentVerovioSourceXml.value.trim().length > 0,
      })
    }
    perf.finish({ skipped: true, reason: 'already-ready' })
    return
  }
  if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[orchestra-prepare]:start', {
      soundfontUrl: orchestraSoundFontUrl.value,
      hasDisplayToolkit: !!displayVerovioToolkit.value,
      hasSourceXml: currentVerovioSourceXml.value.trim().length > 0,
    })
  }
  await orchestraPlayer.prepare(orchestraSoundFontUrl.value)
  perf.mark('orchestraPlayer.prepare')
  orchestraPlaybackReady.value = true
  orchestraSoundfontSourceHint.value = orchestraPlayer.getSoundfontSourceHint()
  if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[orchestra-prepare]:ready', {
      soundfontHint: orchestraSoundfontSourceHint.value,
      hasDisplayToolkit: !!displayVerovioToolkit.value,
      hasSourceXml: currentVerovioSourceXml.value.trim().length > 0,
    })
  }
  const sourceXml = currentVerovioSourceXml.value.trim()
  if (!sourceXml) {
    perf.finish({ skippedSemantic: true, reason: 'no-source-xml' })
    return
  }

  let toolkit = displayVerovioToolkit.value ?? playbackVerovioToolkit.value
  if (!toolkit) {
    try {
      await ensureCurrentMidiPrepared()
      perf.mark('ensureCurrentMidiPrepared(initial)')
    } catch (e) {
      logCaught('ensureOrchestraPrepared:ensure-midi', e)
      perf.finish({ error: 'ensure-midi-failed' })
      return
    }
    toolkit = displayVerovioToolkit.value ?? playbackVerovioToolkit.value
  }
  if (!toolkit) {
    perf.finish({ skippedSemantic: true, reason: 'no-toolkit' })
    return
  }

  rebuildSemanticPlaybackRows(toolkit, sourceXml, 'ensure-orchestra-prepared', currentMidiTotalTicks.value)
  perf.mark('rebuildSemanticPlaybackRows(first)')
  if (playbackSemanticRows.value.length === 0) {
    if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[orchestra-prepare]:semantic-empty-after-first-pass', {
        sourceXmlLen: sourceXml.length,
        currentMidiTotalTicks: currentMidiTotalTicks.value,
      })
    }
    try {
      await ensureCurrentMidiPrepared()
      perf.mark('ensureCurrentMidiPrepared(retry)')
    } catch (e) {
      logCaught('ensureOrchestraPrepared:ensure-midi-retry', e)
    }
    const tk2 = displayVerovioToolkit.value ?? playbackVerovioToolkit.value
    if (tk2) {
      rebuildSemanticPlaybackRows(
        tk2,
        sourceXml,
        'ensure-orchestra-prepared-after-midi',
        currentMidiTotalTicks.value,
      )
      perf.mark('rebuildSemanticPlaybackRows(retry)')
    }
  }
  if (playbackSemanticRows.value.length > 0) {
    schedulePersistCurrentCacheState()
  }
  if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[orchestra-prepare]:semantic-ready', {
      rows: playbackSemanticRows.value.length,
      totalTicks: currentMidiTotalTicks.value,
      engine: renderEngine.value,
    })
  }
  perf.finish({
    semanticRows: playbackSemanticRows.value.length,
    totalTicks: currentMidiTotalTicks.value,
    renderEngine: renderEngine.value,
    soundfontHint: orchestraSoundfontSourceHint.value,
  })
}

type FallbackVerovioToolkitMode = 'generate-midi' | 'enable-playback-api-only'

/**
 * 创建 Verovio fallback playback toolkit（OSMD 显示 / 缓存恢复无 display toolkit 时）。
 * `enable-playback-api-only`：内存已有 MIDI，仅 loadData + renderToMIDI 激活 timemap / getElementsAtTime，不覆盖 midi 字段。
 */
async function ensureFallbackVerovioPlaybackToolkit(
  sourceXml: string,
  perf: ReturnType<typeof createOrchestraPerfTimer>,
  mode: FallbackVerovioToolkitMode,
): Promise<void> {
  const {
    applyScreenLayoutOptions,
    createVerovioToolkit,
    loadMusicXml,
    renderAllPagesSvg: renderAllPagesSvgForPlayback,
    extractPageBoundaryProgress: extractPageBoundaryForPlayback,
    extractSystemBoundaryProgressByPage: extractSystemBoundaryForPlayback,
  } = await import('@/lib/verovio')
  perf.mark('import(verovio)')

  const fallbackToolkit = await createVerovioToolkit()
  perf.mark('createVerovioToolkit(fallback)')
  applyScreenLayoutOptions(fallbackToolkit, {
    pageWidth: verovioPageWidth.value,
    header: verovioShowHeader.value ? 'auto' : 'none',
    footer: verovioShowFooter.value ? 'auto' : 'none',
    inkColor: scoreInkColor.value,
  })
  const loadedOk = loadMusicXml(fallbackToolkit, sourceXml)
  perf.mark('loadMusicXml(fallback)')
  if (!loadedOk) {
    throw new Error('Verovio 无法解析该乐谱数据（播放 fallback toolkit）')
  }

  playbackVerovioToolkit.value = fallbackToolkit

  const midiBase64 = fallbackToolkit.renderToMIDI()
  perf.mark(
    mode === 'enable-playback-api-only'
      ? 'renderToMIDI(fallback-enable-api)'
      : 'renderToMIDI(fallback)',
  )
  if (!midiBase64 && mode === 'generate-midi') {
    throw new Error('Verovio 未输出有效 MIDI 数据（播放 fallback toolkit）')
  }

  if (mode === 'generate-midi' && midiBase64) {
    currentMidiBase64.value = midiBase64
    currentMidiTotalTicks.value = getMidiTotalTicksFromBase64(midiBase64)
    midiTempoMap.value = parseMidiTempoMap(midiBase64)
  }

  if (renderEngine.value === 'verovio' && mode === 'generate-midi') {
    const newPages = renderAllPagesSvgForPlayback(fallbackToolkit)
    perf.mark('renderAllPagesSvg(fallback)')
    if (newPages.length > 0) {
      pagesSvg.value = newPages
      osmdPageMeasureIndexBounds.value = []
      osmdPageMeasureInkNormSpans.value = []
      osmdPageMusicSystemNormBounds.value = []
      pageInkClientRects.value = []
      const pagesCount = newPages.length
      const pageBoundariesRaw = extractPageBoundaryForPlayback(fallbackToolkit)
      playbackPageBoundaries.value = normalizePlaybackPageBoundaries(pageBoundariesRaw, pagesCount)
      const systemRawByPage = extractSystemBoundaryForPlayback(fallbackToolkit)
      playbackSystemBoundariesByPage.value = normalizePlaybackSystemBoundariesByPage(
        systemRawByPage,
        playbackPageBoundaries.value,
        pagesCount,
      )
      perf.mark('extractBoundaries(fallback)')
      if (orchestraPlaybackReady.value) {
        rebuildSemanticPlaybackRows(
          fallbackToolkit,
          sourceXml,
          'ensure-midi-fallback',
          currentMidiTotalTicks.value,
        )
        perf.mark('rebuildSemanticPlaybackRows(fallback)')
      } else {
        playbackSemanticRows.value = []
      }
      orchestraDebugLog('info', '[orchestra-debug] fallback semantic rows', {
        pagesCount,
        semanticRows: playbackSemanticRows.value.length,
      })
    }
  }
}

/**
 * 确保当前乐谱的 MIDI 数据已生成。
 * 调用 Verovio 将当前 MusicXML 渲染为 MIDI base64 字符串，
 * 并解析 MIDI 文件获取总 tick 数用于播放进度计算。
 * @throws 乐谱缺少可播放的源数据时抛出错误
 */
async function ensureCurrentMidiPrepared() {
  const perf = createOrchestraPerfTimer('ensureCurrentMidiPrepared')
  const hadMemoryMidiAtStart =
    currentMidiBase64.value.trim().length > 0 && currentMidiTotalTicks.value > 0
  const sourceXml = (currentVerovioSourceXml.value || currentScoreXmlForExport.value).trim()
  if (!sourceXml) {
    perf.finish({ error: 'no-source-xml' })
    throw new Error('当前乐谱缺少可播放的源数据，请重新打开文件后再试')
  }

  if (currentMidiBase64.value.trim().length > 0 && currentMidiTotalTicks.value > 0) {
    if (!midiTempoMap.value) {
      midiTempoMap.value = parseMidiTempoMap(currentMidiBase64.value)
    }
    if (currentMidiTotalMs.value <= 0 && midiTempoMap.value) {
      currentMidiTotalMs.value = ticksToMilliseconds(
        currentMidiTotalTicks.value,
        midiTempoMap.value.ppq,
        midiTempoMap.value.events,
      )
    }
    perf.mark('reuse-memory-cache')
    if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[ensure-midi]:reuse-memory-cache', {
        midiBase64Len: currentMidiBase64.value.length,
        totalTicks: currentMidiTotalTicks.value,
        totalMs: currentMidiTotalMs.value,
      })
    }
  }

  // 排版切换后若曾出现 display/playback 双实例不同步，会导致 MIDI 已缓存但 getElementsAtTime 与 DOM id 不一致。
  if (
    renderEngine.value === 'verovio' &&
    displayVerovioToolkit.value &&
    playbackVerovioToolkit.value &&
    displayVerovioToolkit.value !== playbackVerovioToolkit.value
  ) {
    currentMidiBase64.value = ''
    currentMidiTotalTicks.value = 0
    midiTempoMap.value = null
    perf.mark('clear-midi-toolkit-mismatch')
  }

  if (currentMidiBase64.value.trim().length === 0) {
    const displayToolkit = displayVerovioToolkit.value
    if (displayToolkit) {
      const midi = displayToolkit.renderToMIDI()
      perf.mark('renderToMIDI(displayToolkit)')
      if (!midi) {
        perf.finish({ error: 'renderToMIDI-empty' })
        throw new Error('Verovio 未输出有效 MIDI 数据')
      }
      playbackVerovioToolkit.value = displayToolkit
      currentMidiBase64.value = midi
      currentMidiTotalTicks.value = getMidiTotalTicksFromBase64(midi)
      midiTempoMap.value = parseMidiTempoMap(midi)
    } else {
      await ensureFallbackVerovioPlaybackToolkit(sourceXml, perf, 'generate-midi')
    }
  } else {
    perf.mark('renderToMIDI:skipped')
    // OSMD / 缓存恢复：内存已有 MIDI 但尚无 playback toolkit，仍需 Verovio 供 timemap / 语义表 / getElementsAtTime。
    if (!playbackVerovioToolkit.value) {
      const displayToolkit = displayVerovioToolkit.value
      if (displayToolkit) {
        playbackVerovioToolkit.value = displayToolkit
        displayToolkit.renderToMIDI()
        perf.mark('renderToMIDI(displayToolkit-enable-api)')
      } else {
        await ensureFallbackVerovioPlaybackToolkit(sourceXml, perf, 'enable-playback-api-only')
      }
    }
  }

  // system 边界用于指示线在换行点重置（页面来自 renderToTimemap，系统来自 systemOn）
  const toolkit = playbackVerovioToolkit.value
  if (!toolkit) {
    perf.finish({ skipped: true, reason: 'no-playback-toolkit' })
    return
  }

  // 计算 tick→ms 总时长映射，用于把真实播放时间喂给 getElementsAtTime，
  // 避免仅用 tick 比例造成“匀速”指示线错位（tempo/forward/rest 等）。
  if (midiTempoMap.value && currentMidiTotalTicks.value > 0) {
    currentMidiTotalMs.value = ticksToMilliseconds(
      currentMidiTotalTicks.value,
      midiTempoMap.value.ppq,
      midiTempoMap.value.events,
    )
  } else {
    currentMidiTotalMs.value = 0
  }
  perf.mark('compute-totalMs')

  if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
    const now = Date.now()
    if (now - lastMidiPreparedLogAt > 1500) {
      // eslint-disable-next-line no-console
      console.log('[indicator-midi-prepared]', {
        totalTicks: currentMidiTotalTicks.value,
        totalMs: currentMidiTotalMs.value,
        ppq: midiTempoMap.value?.ppq,
        tempoEventsLen: midiTempoMap.value?.events?.length ?? 0,
        totalPages: totalPages.value || pagesSvg.value.length,
      })
      lastMidiPreparedLogAt = now
    }
  }

  const pagesCount = totalPages.value || pagesSvg.value.length
  if (!pagesCount || pagesCount < 1) {
    perf.finish({ skipped: true, reason: 'no-pages' })
    return
  }

  const needSystemBoundaries =
    playbackSystemBoundariesByPage.value.length !== pagesCount ||
    playbackSystemBoundariesByPage.value.some((arr) => !Array.isArray(arr) || arr.length === 0)

  if (needSystemBoundaries) {
    const { extractPageBoundaryProgress, extractSystemBoundaryProgressByPage } = await import('@/lib/verovio')
    perf.mark('import(verovio-boundaries)')
    const pageBoundariesRaw = extractPageBoundaryProgress(toolkit)
    playbackPageBoundaries.value = normalizePlaybackPageBoundaries(pageBoundariesRaw, pagesCount)
    const systemRawByPage = extractSystemBoundaryProgressByPage(toolkit)
    playbackSystemBoundariesByPage.value = normalizePlaybackSystemBoundariesByPage(
      systemRawByPage,
      playbackPageBoundaries.value,
      pagesCount,
    )
    perf.mark('extractPageAndSystemBoundaries')
  } else {
    perf.mark('extractBoundaries:skipped')
  }
  if (playbackSemanticRows.value.length === 0) {
    if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[ensure-midi]:semantic-missing', {
        pagesCount,
        currentMidiTotalTicks: currentMidiTotalTicks.value,
        hasSourceXml: sourceXml.trim().length > 0,
        orchestraPlaybackReady: orchestraPlaybackReady.value,
      })
    }
    rebuildSemanticPlaybackRows(
      toolkit,
      sourceXml,
      'ensure-midi-missing-semantic',
      currentMidiTotalTicks.value,
    )
    perf.mark('rebuildSemanticPlaybackRows(missing-semantic)')
    orchestraDebugLog('info', '[orchestra-debug] ensure semantic rows', {
      semanticRows: playbackSemanticRows.value.length,
      pagesCount,
    })
    if (playbackSemanticRows.value.length > 0) {
      schedulePersistCurrentCacheState()
    }
  } else {
    perf.mark('rebuildSemanticPlaybackRows:skipped')
  }

  if (playbackVerovioToolkit.value == null) {
    playbackVerovioToolkit.value = toolkit
    if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[ensure-midi]:playback-toolkit-bound', {
        pagesCount,
        currentPage: currentPage.value,
        currentMidiTotalTicks: currentMidiTotalTicks.value,
      })
    }
  }

  perf.finish({
    renderEngine: renderEngine.value,
    pagesCount,
    totalTicks: currentMidiTotalTicks.value,
    semanticRows: playbackSemanticRows.value.length,
    hadMemoryMidiCache: hadMemoryMidiAtStart,
    usedFallbackToolkit: !displayVerovioToolkit.value && !!playbackVerovioToolkit.value,
  })
}

/**
 * 更新播放位置（由 rAF 循环每帧调用）。
 * 从 FluidSynth 获取当前 tick → 计算整体进度 [0,1] → 映射到页号。
 * 使用播放指示线显示当前播放位置。
 * 翻页模式：自动切换到当前播放的页码；
 * 滚动模式：自动滚动视口跟随播放位置。
 */
async function updatePlaybackCursor() {
  if (orchestraNotePreviewActive.value) return
  if (!orchestraPlaying.value || !currentMidiTotalTicks.value || totalPages.value < 1) return
  currentPlaybackHitElementIds.value = []
  const rawTick = await orchestraPlayer.getCurrentTick()
  const maxTick = currentMidiTotalTicks.value
  let currentTick = Math.min(rawTick, maxTick)
  if (rawTick + 240 < lastStablePlaybackTick) {
    // 播放中偶发 retrievePlayerCurrentTick 回跳到 0：忽略该帧，避免页码抖动与错误翻页。
    currentTick = lastStablePlaybackTick
    const now = Date.now()
    if (now - lastTickRegressionLogAt > 1200 && (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled)) {
      // eslint-disable-next-line no-console
      console.log('[playback-tick-guard]', {
        rawTick,
        stableTick: lastStablePlaybackTick,
      })
      lastTickRegressionLogAt = now
    }
  }
  if (currentTick >= lastStablePlaybackTick) {
    lastStablePlaybackTick = Math.min(currentTick, maxTick)
  }
  currentPlaybackTick.value = currentTick
  // 用于 getElementsAtTime 的“真实时间轴”（不再用于翻页/页内映射，避免 page 选择偏差）。
  const currentMs =
    midiTempoMap.value && currentMidiTotalMs.value > 0
      ? ticksToMilliseconds(currentTick, midiTempoMap.value.ppq, midiTempoMap.value.events)
      : 0

  // 页码/页内进度映射默认使用 tick 比例；若有语义播放表则优先查表。
  const progressTick = clampPlaybackProgress(currentTick, currentMidiTotalTicks.value)
  let progress = progressTick

  const boundaries = playbackPageBoundaries.value
  const semanticMapped = mapTickToSemanticPlayback(currentTick, playbackSemanticRows.value)
  if (semanticMapped) {
    progress = semanticMapped.progress
  }
  if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
    const now = Date.now()
    if (now - lastSemanticPlaybackLogAt > 1200) {
      // eslint-disable-next-line no-console
      console.log('[semantic-playback]', {
        rows: playbackSemanticRows.value.length,
        tick: currentTick,
        semanticMapped: !!semanticMapped,
        mappedPage: semanticMapped?.page ?? null,
        mappedProgress: semanticMapped?.progress ?? null,
        source: semanticMapped ? 'semantic' : 'tick-fallback',
        semanticPageReliable: playbackSemanticPageReliable,
        currentMidiTotalTicks: currentMidiTotalTicks.value,
        currentMidiTotalMs: currentMidiTotalMs.value,
        semanticRowsPreview: playbackSemanticRows.value.slice(0, 8),
      })
      lastSemanticPlaybackLogAt = now
    }
  }

  const mapped =
    boundaries.length === totalPages.value
      ? mapProgressToPagePositionAccurate(progress, totalPages.value, boundaries)
      : mapProgressToPagePosition(progress, totalPages.value)

  const mappedSafePage = Math.max(1, Math.min(totalPages.value, Math.floor(mapped.page || 1)))
  let safePage = getBestPlaybackIndicatorPage(semanticMapped, mappedSafePage)

  let safeInPageProgress = Number.isFinite(mapped.inPageProgress)
    ? Math.max(0, Math.min(1, mapped.inPageProgress))
    : 0
  if (semanticMapped && playbackSemanticPageReliable && mappedSafePage === semanticMapped.page && boundaries.length === totalPages.value) {
    const prev = safePage > 1 ? boundaries[safePage - 2] : 0
    const cur = boundaries[safePage - 1] ?? 1
    const span = cur - prev
    safeInPageProgress = span > 1e-9 ? Math.max(0, Math.min(1, (progress - prev) / span)) : 0
  }

  /** OSMD：按 MusicXML 小节 + 引擎分页/墨迹几何驱动页码与横向位置（连谱），避免整页匀速。 */
  let osmdPlaybackHit: OsmdPlaybackCursorHit | null = null
  if (
    renderEngine.value === 'osmd' &&
    totalPages.value > 0 &&
    osmdPageMeasureIndexBounds.value.length === totalPages.value &&
    osmdPageMeasureInkNormSpans.value.length === totalPages.value
  ) {
    const xml = (currentVerovioSourceXml.value || currentScoreXmlForExport.value || '').trim()
    if (xml.length > 0) {
      osmdPlaybackHit = resolveOsmdPlaybackCursorHit({
        currentTick,
        totalMidiTicks: currentMidiTotalTicks.value,
        musicXml: xml,
        pageBounds: osmdPageMeasureIndexBounds.value,
        pageInkSpansByPage: osmdPageMeasureInkNormSpans.value,
        layoutCacheKey: selectedCacheKey.value || '',
      })
      if (osmdPlaybackHit) {
        safePage = Math.max(1, Math.min(totalPages.value, osmdPlaybackHit.page1Based))
        safeInPageProgress = osmdPlaybackHit.pageDerivedProgress
      }
    }
  }

  const now = Date.now()
  if (now - playbackDebugLastLogAt >= 180) {
    playbackDebugLastLogAt = now
    orchestraDebugLog('log', '[orchestra-debug] playback cursor', {
      tick: currentTick,
      totalTicks: currentMidiTotalTicks.value,
      progress: Number(progress.toFixed(4)),
      mappedPage: mapped.page,
      safePage,
      currentPage: currentPage.value,
      inPageProgress: Number(safeInPageProgress.toFixed(4)),
      totalPages: totalPages.value,
      boundariesLen: boundaries.length,
      useAccurateMap: boundaries.length === totalPages.value,
      viewMode: viewMode.value,
    })
  }

  if (viewMode.value === 'page') {
    let didSwitchPage = false
    const flipThreshold = getPlaybackPageFlipThreshold(currentPage.value)
    const shouldPageFlip = shouldAutoFlipPlaybackPage(
      currentPage.value,
      safePage,
      progress,
      flipThreshold,
      currentTick,
      osmdPlaybackHit,
    )
    if (shouldPageFlip && currentPage.value !== safePage) {
      orchestraDebugLog('warn', '[orchestra-debug] page switched', {
        from: currentPage.value,
        to: safePage,
        progress: Number(progress.toFixed(4)),
        flipThreshold: Number(flipThreshold.toFixed(4)),
        tick: currentTick,
        flipByOsmdPage: !!(renderEngine.value === 'osmd' && osmdPlaybackHit),
      })
      currentPage.value = safePage
      playbackActiveSystemPage = -1
      playbackActiveSystemIndex = 0
      resetPlaybackEntryLock('page-turn')
      didSwitchPage = true
      schedulePersistCurrentCacheState()
    }
    if (didSwitchPage) {
      await nextTick()
    }

    // 仅 Verovio：playback toolkit 的 xml:id 与当前 DOM 一致；OSMD 走墨迹映射分支，避免 getElementsAtTime 整段失败。
    const pageHost = pageSwipeHostRef.value
    const canUseElementsLocator = renderEngine.value === 'verovio'
    if (canUseElementsLocator && pageHost && currentMidiTotalMs.value > 0) {
      const playbackIndex = buildPlaybackElementIndexIfNeeded()
      const pageEntries = playbackIndex.entries.filter((entry) => entry.page === safePage)
      const lockedEntry = advancePlaybackEntryLock(currentTick, safePage)

      const resolvedIds = resolvePlaybackElementIdsFromIndex(
        lockedEntry ? [lockedEntry.id] : pageEntries.map((entry) => entry.id),
      )
      const updated = await tryUpdatePlaybackIndicatorByElementsAtTime({
        millisec: currentMs,
        indicatorHost: pageHost,
        queryRoot: pageHost,
        expectedPage: safePage,
        lockedEntry,
      })
      if (updated) {
        if (resolvedIds.length > 0) {
          currentPlaybackHitElementIds.value = resolvedIds
        }
        return
      }
      const now = Date.now()
      const shouldLog = now - lastIndicatorFailLogAt > 800
      if (shouldLog && (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled)) {
        // eslint-disable-next-line no-console
        console.log('[indicator-fail]', {
          reason: lastIndicatorDebug?.reason,
          millisec: lastIndicatorDebug?.millisec,
          page: lastIndicatorDebug?.page,
          currentMidiTotalMs: lastIndicatorDebug?.currentMidiTotalMs,
          midiTempoEventsLen: lastIndicatorDebug?.midiTempoEventsLen,
          systemsLayoutMeasuredPage: lastIndicatorDebug?.systemsLayoutMeasuredPage,
          systemsLayoutLen: lastIndicatorDebug?.systemsLayoutLen,
          idsLen: lastIndicatorDebug?.idsLen,
          foundInDomCount: lastIndicatorDebug?.foundInDomCount,
          rectValidCount: lastIndicatorDebug?.rectValidCount,
          idsSample: lastIndicatorDebug?.idsSample,
          currentMs,
          currentPage: currentPage.value,
          safePage,
        })
        lastIndicatorFailLogAt = now
      }
    }

    // 确保系统布局已测量（处理翻页后时序 / OSMD 走墨迹分支时 layout 可能为 null）
    if (pageHost && (!playbackIndicatorSystemsLayout.value || playbackIndicatorSystemsLayoutMeasuredPage !== safePage)) {
      const measureSvg =
        pageHost.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
        pageHost.querySelector<SVGSVGElement>('svg')
      const measuredSystems = measurePlaybackSystemsLayoutForPage(pageHost, measureSvg, safePage)
      if (measuredSystems && measuredSystems.length > 0) {
        playbackIndicatorSystemsLayout.value = measuredSystems
        playbackIndicatorSystemsLayoutMeasuredPage = safePage
      }
    }

    const systemEnds = playbackSystemBoundariesByPage.value[safePage - 1] ?? []
    const useSystemLayout = playbackIndicatorSystemsLayout.value !== null && playbackIndicatorSystemsLayoutMeasuredPage === safePage
    const systemsCount = useSystemLayout ? playbackIndicatorSystemsLayout.value!.length : 1

    let systemIndex = 0
    let inSystemProgress = safeInPageProgress
    if (renderEngine.value === 'osmd' && osmdPlaybackHit) {
      const systems = useSystemLayout ? playbackIndicatorSystemsLayout.value! : null
      const resolved = resolveOsmdSystemProgressFromInk({
        nxInk: osmdPlaybackHit.nxInk,
        nyInk: osmdPlaybackHit.nyInk,
        systems,
      })
      systemIndex = resolved.systemIndex
      inSystemProgress = resolved.inSystemProgress
      // 旧缓存或未带 top/bottom 的 ink span 无法推算 nyInk，各 system 会共用整页横向范围；用语义表的 system 回退。
      if (
        osmdPlaybackHit.nyInk == null &&
        semanticMapped?.system != null &&
        systemsCount > 1
      ) {
        const semSys = Math.max(1, Math.floor(semanticMapped.system))
        systemIndex = Math.max(0, Math.min(systemsCount - 1, semSys - 1))
      }
    } else if (systemsCount > 1 && systemEnds.length === systemsCount) {
      const p = Math.max(0, Math.min(1, safeInPageProgress))
      if (p >= 1) {
        systemIndex = systemsCount - 1
        inSystemProgress = 1
      } else if (p <= 0) {
        systemIndex = 0
        inSystemProgress = 0
      } else {
        let lo = 0
        let hi = systemEnds.length - 1
        while (lo < hi) {
          const mid = (lo + hi) >>> 1
          if (systemEnds[mid] < p) lo = mid + 1
          else hi = mid
        }
        systemIndex = lo
        const prev = systemIndex > 0 ? systemEnds[systemIndex - 1] : 0
        const cur = systemEnds[systemIndex] ?? 1
        const span = cur - prev
        inSystemProgress = span > 1e-9 ? (p - prev) / span : 0
        inSystemProgress = Math.max(0, Math.min(1, inSystemProgress))
      }
    } else {
      // 回退：按系统数量平均切分（仍能保证“换行点重置”视觉正确）
      const safeSystems = Math.max(1, systemsCount)
      const p = Math.max(0, Math.min(1, safeInPageProgress))
      if (p >= 1) {
        systemIndex = safeSystems - 1
        inSystemProgress = 1
      } else if (p <= 0) {
        systemIndex = 0
        inSystemProgress = 0
      } else {
        const absolute = p * safeSystems
        systemIndex = Math.min(safeSystems - 1, Math.floor(absolute))
        const sysStart = systemIndex / safeSystems
        const sysEnd = (systemIndex + 1) / safeSystems
        const span = sysEnd - sysStart
        inSystemProgress = span > 1e-9 ? (p - sysStart) / span : 0
      }
    }

    const needLayoutUpdate = safePage !== playbackActiveSystemPage || systemIndex !== playbackActiveSystemIndex

    if (needLayoutUpdate) {
      playbackActiveSystemPage = safePage
      playbackActiveSystemIndex = systemIndex

      if (useSystemLayout) {
        const sysLayout = playbackIndicatorSystemsLayout.value![systemIndex]
        syncPlaybackIndicatorLayoutFromSystem(sysLayout)
        applyPlaybackIndicatorSystemVertical(sysLayout, {
          coordsHost: pageHost,
          page1Based: safePage,
          systemIndex,
        })
      } else if (pageHost) {
        const fallbackRange = measurePlaybackStaffHorizontalRange(pageHost)
        playbackIndicatorLayout.value = fallbackRange ?? { startRatio: 0, spanRatio: 1 }
        rebuildPlaybackIndicatorDisplayGeom()
        if (
          !syncPlaybackIndicatorVerticalForSystem(pageHost, safePage, systemIndex) &&
          !applyPlaybackIndicatorVerticalFromOsmdSystemBounds(pageHost, safePage, systemIndex)
        ) {
          const pgHostHeight = pageHost.getBoundingClientRect().height
          if (
            osmdPlaybackHit &&
            pgHostHeight > 1 &&
            osmdPlaybackHit.nyTop != null &&
            osmdPlaybackHit.nyBottom != null
          ) {
            playbackIndicatorLineTopPx.value = (osmdPlaybackHit.nyTop as number) * pgHostHeight
            playbackIndicatorLineBottomPx.value = Math.max(
              PLAYBACK_INDICATOR_FOOTER_RESERVE_PX,
              (1 - (osmdPlaybackHit.nyBottom as number)) * pgHostHeight,
            )
          }
        }
      }
    } else if (useSystemLayout && pageHost) {
      applyPlaybackIndicatorSystemVertical(playbackIndicatorSystemsLayout.value![systemIndex]!, {
        coordsHost: pageHost,
        page1Based: safePage,
        systemIndex,
        refreshHorizontal: false,
      })
    } else if (pageHost) {
      syncPlaybackIndicatorVerticalForSystem(pageHost, safePage, systemIndex)
    }

    updatePlaybackIndicator(inSystemProgress)
    return
  }

  // 滚动模式：自动跟随播放位置滚动视口
  const scrollDom = getPlaybackPageDomContext(safePage)
  if (!scrollDom) return
  const host = scrollDom.coordsHost
  const block = scrollDom.queryRoot
  const pageSvg = scrollDom.svg
  const playbackScrollPageChanged = currentPage.value !== safePage
  currentPage.value = safePage
  if (playbackScrollPageChanged) {
    schedulePersistCurrentCacheState()
  }
  if (playbackIndicatorScrollMeasuredPage !== safePage) {
    const measuredSystems = measurePlaybackSystemsLayoutForPage(host, pageSvg, safePage)
    playbackIndicatorSystemsLayout.value = measuredSystems
    playbackIndicatorSystemsLayoutMeasuredPage = safePage
    if (measuredSystems && measuredSystems.length > 0) {
      const first = measuredSystems[0]
      syncPlaybackIndicatorLayoutFromSystem(first)
      applyPlaybackIndicatorSystemVertical(first, {
        coordsHost: host,
        page1Based: safePage,
        systemIndex: 0,
        svg: pageSvg,
      })
    } else {
      const fallbackRange = measurePlaybackStaffHorizontalRange(host, pageSvg)
      playbackIndicatorLayout.value = fallbackRange ?? { startRatio: 0, spanRatio: 1 }
      rebuildPlaybackIndicatorDisplayGeom()
      syncPlaybackIndicatorVerticalForSystem(host, safePage, 0)
    }
    playbackIndicatorScrollMeasuredPage = safePage
    playbackActiveSystemPage = -1
    playbackActiveSystemIndex = 0
  }

  // 滚动模式：仅 Verovio 画面与 playback 元素 id 对齐时才用 getElementsAtTime 精定位。
  const indicatorUpdatedByElements =
    renderEngine.value === 'verovio' && host && currentMidiTotalMs.value > 0
      ? await tryUpdatePlaybackIndicatorByElementsAtTime({
          millisec: currentMs,
          indicatorHost: host,
          queryRoot: block,
          expectedPage: safePage,
        })
      : false

  if (!indicatorUpdatedByElements) {
    // 确保系统布局已测量（处理翻页后时序 / OSMD 走墨迹分支时 layout 可能为 null）
    if (host && (!playbackIndicatorSystemsLayout.value || playbackIndicatorSystemsLayoutMeasuredPage !== safePage)) {
      const measuredSystems = measurePlaybackSystemsLayoutForPage(host, pageSvg, safePage)
      if (measuredSystems && measuredSystems.length > 0) {
        playbackIndicatorSystemsLayout.value = measuredSystems
        playbackIndicatorSystemsLayoutMeasuredPage = safePage
      }
    }

    const systemEnds = playbackSystemBoundariesByPage.value[safePage - 1] ?? []
    const useSystemLayout =
      playbackIndicatorSystemsLayout.value !== null && playbackIndicatorSystemsLayoutMeasuredPage === safePage
    const systemsCount = useSystemLayout ? playbackIndicatorSystemsLayout.value!.length : 1

    let systemIndex = 0
    let inSystemProgress = safeInPageProgress
    if (renderEngine.value === 'osmd' && osmdPlaybackHit) {
      const systems = useSystemLayout ? playbackIndicatorSystemsLayout.value! : null
      const resolved = resolveOsmdSystemProgressFromInk({
        nxInk: osmdPlaybackHit.nxInk,
        nyInk: osmdPlaybackHit.nyInk,
        systems,
      })
      systemIndex = resolved.systemIndex
      inSystemProgress = resolved.inSystemProgress
      // 旧缓存或未带 top/bottom 的 ink span 无法推算 nyInk，各 system 会共用整页横向范围；用语义表的 system 回退。
      if (
        osmdPlaybackHit.nyInk == null &&
        semanticMapped?.system != null &&
        systemsCount > 1
      ) {
        const semSys = Math.max(1, Math.floor(semanticMapped.system))
        systemIndex = Math.max(0, Math.min(systemsCount - 1, semSys - 1))
      }
    } else if (systemsCount > 1 && systemEnds.length === systemsCount) {
      const p = Math.max(0, Math.min(1, safeInPageProgress))
      if (p >= 1) {
        systemIndex = systemsCount - 1
        inSystemProgress = 1
      } else if (p <= 0) {
        systemIndex = 0
        inSystemProgress = 0
      } else {
        let lo = 0
        let hi = systemEnds.length - 1
        while (lo < hi) {
          const mid = (lo + hi) >>> 1
          if (systemEnds[mid] < p) lo = mid + 1
          else hi = mid
        }
        systemIndex = lo
        const prev = systemIndex > 0 ? systemEnds[systemIndex - 1] : 0
        const cur = systemEnds[systemIndex] ?? 1
        const span = cur - prev
        inSystemProgress = span > 1e-9 ? (p - prev) / span : 0
        inSystemProgress = Math.max(0, Math.min(1, inSystemProgress))
      }
    } else {
      const safeSystems = Math.max(1, systemsCount)
      const p = Math.max(0, Math.min(1, safeInPageProgress))
      if (p >= 1) {
        systemIndex = safeSystems - 1
        inSystemProgress = 1
      } else if (p <= 0) {
        systemIndex = 0
        inSystemProgress = 0
      } else {
        const absolute = p * safeSystems
        systemIndex = Math.min(safeSystems - 1, Math.floor(absolute))
        const sysStart = systemIndex / safeSystems
        const sysEnd = (systemIndex + 1) / safeSystems
        const span = sysEnd - sysStart
        inSystemProgress = span > 1e-9 ? (p - sysStart) / span : 0
      }
    }

    const needLayoutUpdate = safePage !== playbackActiveSystemPage || systemIndex !== playbackActiveSystemIndex

    if (needLayoutUpdate) {
      playbackActiveSystemPage = safePage
      playbackActiveSystemIndex = systemIndex

      if (useSystemLayout) {
        const sysLayout = playbackIndicatorSystemsLayout.value![systemIndex]
        syncPlaybackIndicatorLayoutFromSystem(sysLayout)
        applyPlaybackIndicatorSystemVertical(sysLayout, {
          coordsHost: host,
          page1Based: safePage,
          systemIndex,
          svg: pageSvg,
        })
      } else {
        const fallbackRange = measurePlaybackStaffHorizontalRange(host, pageSvg)
        playbackIndicatorLayout.value = fallbackRange ?? { startRatio: 0, spanRatio: 1 }
        rebuildPlaybackIndicatorDisplayGeom()
        if (
          !syncPlaybackIndicatorVerticalForSystem(host, safePage, systemIndex) &&
          !applyPlaybackIndicatorVerticalFromOsmdSystemBounds(host, safePage, systemIndex)
        ) {
          const scHostH = host.getBoundingClientRect().height
          if (
            osmdPlaybackHit &&
            scHostH > 1 &&
            osmdPlaybackHit.nyTop != null &&
            osmdPlaybackHit.nyBottom != null
          ) {
            playbackIndicatorLineTopPx.value = (osmdPlaybackHit.nyTop as number) * scHostH
            playbackIndicatorLineBottomPx.value = Math.max(
              PLAYBACK_INDICATOR_FOOTER_RESERVE_PX,
              (1 - (osmdPlaybackHit.nyBottom as number)) * scHostH,
            )
          }
        }
      }
    } else if (useSystemLayout) {
      applyPlaybackIndicatorSystemVertical(playbackIndicatorSystemsLayout.value![systemIndex]!, {
        coordsHost: host,
        page1Based: safePage,
        systemIndex,
        svg: pageSvg,
        refreshHorizontal: false,
      })
    } else {
      syncPlaybackIndicatorVerticalForSystem(host, safePage, systemIndex)
    }

    updatePlaybackIndicator(inSystemProgress)
  }
  const targetHeight = block.getBoundingClientRect().height || block.offsetHeight
  if (targetHeight <= 0) return

  if (!scrollPlaybackAutoFollowEnabled.value || scrollPlaybackFollowPaused) return

  const scrollEl = await getScoreScrollElement()
  if (!scrollEl) return
  const scrollRect = scrollEl.getBoundingClientRect()
  const blockRect = block.getBoundingClientRect()
  const targetY = blockRect.top - scrollRect.top + scrollEl.scrollTop + safeInPageProgress * targetHeight
  const desiredScrollTop = targetY - scrollEl.clientHeight * 0.35
  setPlaybackAutoScrollTop(scrollEl, desiredScrollTop)
}

/**
 * 停止播放 rAF 动画循环。
 */
function stopPlaybackIndicatorVisualLoop() {
  if (playbackIndicatorVisualRafId !== null) {
    cancelAnimationFrame(playbackIndicatorVisualRafId)
    playbackIndicatorVisualRafId = null
  }
}

/** 指示线展示值向 target 缓动；与逻辑 tick 轮询解耦，避免 updatePlaybackCursor 变慢时卡顿。 */
function startPlaybackIndicatorVisualLoop() {
  if (playbackIndicatorVisualRafId !== null) return
  playbackIndicatorTargetSampleAt = 0
  playbackIndicatorTargetVelocity = 0
  if (!playbackIndicatorDisplayGeom) {
    rebuildPlaybackIndicatorDisplayGeom()
  }
  const step = () => {
    if (!orchestraPlaying.value) {
      stopPlaybackIndicatorVisualLoop()
      return
    }
    syncPlaybackIndicatorVisualProgress(false)
    playbackIndicatorVisualRafId = requestAnimationFrame(step)
  }
  playbackIndicatorVisualRafId = requestAnimationFrame(step)
}

function stopPlaybackCursorLoop() {
  stopPlaybackIndicatorVisualLoop()
  if (playbackCursorRafId !== null) {
    cancelAnimationFrame(playbackCursorRafId)
    playbackCursorRafId = null
  }
}

/**
 * 启动播放 rAF 动画循环。
 * 使用 requestAnimationFrame 以约 60fps 的频率轮询 FluidSynth 的当前 tick，
 * 实时更新播放位置和高亮音符。播放停止时自动终止循环。
 */
function startPlaybackCursorLoop() {
  if (playbackCursorRafId !== null) return
  startPlaybackIndicatorVisualLoop()
  const tick = async () => {
    if (!orchestraPlaying.value) {
      stopPlaybackCursorLoop()
      return
    }
    await updatePlaybackCursor()
    playbackCursorRafId = requestAnimationFrame(() => {
      void tick()
    })
  }
  playbackCursorRafId = requestAnimationFrame(() => {
    void tick()
  })
}

/**
 * 准备交响乐音色库（用户手动点击"准备乐器音色库"按钮触发）。
 * 加载 FluidSynth 脚本和 Soundfont 文件，初始化音频合成器。
 */
async function prepareOrchestraPlayback() {
  if (orchestraPlaybackLoading.value) return
  orchestraPlaybackLoading.value = true
  error.value = ''
  const perf = createOrchestraPerfTimer('prepareOrchestraPlayback')
  try {
    await ensureOrchestraPrepared()
    perf.mark('ensureOrchestraPrepared')
    await ensureCurrentMidiPrepared()
    perf.mark('ensureCurrentMidiPrepared')
    const tkPrepare =
      displayVerovioToolkit.value ?? playbackVerovioToolkit.value
    const semanticRowsAlreadyBuilt =
      playbackSemanticRows.value.length > 0 && currentMidiTotalTicks.value > 0
    if (tkPrepare && currentVerovioSourceXml.value.trim().length > 0) {
      if (!semanticRowsAlreadyBuilt) {
        rebuildSemanticPlaybackRows(
          tkPrepare,
          currentVerovioSourceXml.value,
          'prepare-orchestra-playback',
          currentMidiTotalTicks.value,
        )
        perf.mark('rebuildSemanticPlaybackRows(final)')
      } else {
        perf.mark('rebuildSemanticPlaybackRows(final):skipped-existing')
      }
      if (playbackSemanticRows.value.length > 0) {
        schedulePersistCurrentCacheState()
      }
    } else {
      perf.mark('rebuildSemanticPlaybackRows(final):skipped')
    }
  } catch (e) {
    logCaught('prepareOrchestraPlayback failed', e)
    error.value = e instanceof Error ? e.message : String(e)
    perf.finish({ error: e instanceof Error ? e.message : String(e) })
    return
  } finally {
    orchestraPlaybackLoading.value = false
  }
  perf.finish({
    fileName: fileName.value,
    renderEngine: renderEngine.value,
    semanticRows: playbackSemanticRows.value.length,
    totalTicks: currentMidiTotalTicks.value,
    soundfontHint: orchestraSoundfontSourceHint.value,
  })
}

/**
 * 开始/恢复交响乐播放（用户点击"播放"按钮触发）。
 * 1. 确保音色库就绪
 * 2. 若有暂停的 MIDI 数据且可用，则恢复播放（resume）
 * 3. 否则重新生成 MIDI 并从头开始播放
 * 播放开始后，OrchestraPlayer 的 onPlayingChange 回调会自动启动光标动画循环。
 */
async function playOrchestra() {
  if (orchestraPlaybackLoading.value) return
  collapseFileToolPanel()
  orchestraPlaybackPaused.value = false
  orchestraPlaybackLoading.value = true
  error.value = ''
  try {
    await ensureOrchestraPrepared()
    if (
      orchestraResumeEligible &&
      orchestraPlayer.isReady() &&
      !orchestraPlayer.isPlaying() &&
      currentMidiBase64.value &&
      !orchestraPlaying.value
    ) {
      await orchestraPlayer.resume()
      return
    }
    await ensureCurrentMidiPrepared()
    currentMidiTotalTicks.value = Math.max(
      currentMidiTotalTicks.value,
      getMidiTotalTicksFromBase64(currentMidiBase64.value),
    )
    orchestraResumeEligible = false
    await resetPlaybackViewForFreshStart()
    await orchestraPlayer.playFromBase64Midi(currentMidiBase64.value)
  } catch (e) {
    logCaught('playOrchestra failed', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    orchestraPlaybackLoading.value = false
  }
}

/**
 * 暂停交响乐播放。
 * 保存当前 MIDI tick 位置以便后续恢复，停止播放光标动画。
 */
async function pauseOrchestra() {
  if (orchestraPlaybackLoading.value || !orchestraPlaybackReady.value) return
  orchestraPlaybackLoading.value = true
  try {
    await orchestraPlayer.pause()
    orchestraResumeEligible = true
    orchestraPlaybackPaused.value = true
    try {
      currentPlaybackTick.value = Math.min(
        await orchestraPlayer.getCurrentTick(),
        currentMidiTotalTicks.value,
      )
    } catch {
      // ignore
    }
  } catch (e) {
    logCaught('pauseOrchestra failed', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    stopPlaybackCursorLoop()
    orchestraPlaybackLoading.value = false
  }
}

/**
 * 完全停止交响乐播放并隐藏播放光标。
 */
function stopOrchestra() {
  stopPlaybackCursorLoop()
  orchestraPlaybackPaused.value = false
  clearPlaybackIndicator()
  orchestraResumeEligible = false
  orchestraPlayer.stop()
}

/**
 * 点击乐符时短促播放对应音符声音（预览）。
 * - 仅在非标注模式、播放器已就绪、非播放状态下触发
 * - Verovio：elementFromPoint → getTimeForElement → tick → seek → 短播 → 停止
 * - OSMD：DOM 测量 system 位置 → 映射 tick → seek → 短播 → 停止
 */
async function onNoteClick(payload: {
  clientX: number
  clientY: number
  x: number
  y: number
  page?: number
}) {
  if (annotationMode.value || orchestraPlaying.value) return
  if (!Number.isFinite(payload.clientX) || !Number.isFinite(payload.clientY)) return
  if (!orchestraPlaybackReady.value || !currentMidiBase64.value) return

  let targetTick: number | null = null

  // Verovio 路径
  if (renderEngine.value === 'verovio') {
    const tk = displayVerovioToolkit.value ?? playbackVerovioToolkit.value
    if (!tk || currentMidiTotalMs.value <= 0) return
    const root = getScoreAnnotationHitTestRoot()
    if (!root) return
    const id = findNotationXmlIdUnderPoint(payload.clientX, payload.clientY, root, (xmlId) => {
      try { return tk.getTimeForElement(xmlId) >= 0 } catch { return false }
    })
    if (id) {
      const ms = resolveVerovioElementStartMs(tk, id, currentMidiTotalMs.value)
      if (ms !== null) {
        targetTick = millisecondsToTickLinear(ms, currentMidiTotalMs.value, currentMidiTotalTicks.value)
      }
    }
  }

  // OSMD 路径：DOM 测量 system → 行内横向位置 → 页进度 → tick
  if (renderEngine.value === 'osmd' && targetTick === null) {
    if (!currentMidiTotalTicks.value || totalPages.value < 1) return
    const pg = Number.isFinite(payload.page) ? (payload.page as number) : currentPage.value
    if (pg < 1 || pg > totalPages.value) return
    const ctx = getPlaybackPageDomContext(pg)
    if (!ctx?.coordsHost) return
    const svg =
      ctx.svg ??
      ctx.coordsHost.querySelector<SVGSVGElement>('.score-pinch-viewport svg') ??
      ctx.coordsHost.querySelector<SVGSVGElement>('svg')
    if (!svg) return

    const systems = measurePlaybackSystemsLayout(ctx.coordsHost, svg, {})
    if (!systems?.length) return

    const coordsHostRect = ctx.coordsHost.getBoundingClientRect()
    if (coordsHostRect.width <= 1 || coordsHostRect.height <= 1) return
    const clickYInHost = payload.clientY - coordsHostRect.top

    let systemIndex = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i]!
      if (clickYInHost >= s.topPx - 2 && clickYInHost <= s.bottomPx + 2) {
        systemIndex = i; bestDist = 0; break
      }
      const mid = (s.topPx + s.bottomPx) / 2
      const d = Math.abs(clickYInHost - mid)
      if (d < bestDist) { bestDist = d; systemIndex = i }
    }

    const sys = systems[systemIndex]!
    const clickXRatio = (payload.clientX - coordsHostRect.left) / coordsHostRect.width
    const systemLocalX = Math.max(0, Math.min(1,
      (clickXRatio - sys.startRatio) / Math.max(0.02, sys.spanRatio),
    ))
    const pageProgress = sys.startRatio + systemLocalX * sys.spanRatio
    targetTick = Math.round(pageProgress * currentMidiTotalTicks.value)
  }

  if (targetTick === null) return
  targetTick = Math.max(0, Math.min(currentMidiTotalTicks.value, targetTick))

  orchestraNotePreviewActive.value = true
  clearPlaybackIndicator()
  try {
    await orchestraPlayer.pause()
    orchestraPlayer.loadMidiData(currentMidiBase64.value)
    orchestraPlayer.seekToTick(targetTick)
    orchestraResumeEligible = true
    await orchestraPlayer.resume()
    // 播放约 600ms 后停止
    await new Promise<void>((r) => setTimeout(r, 600))
  } finally {
    orchestraPlayer.stop()
    orchestraPlaybackPaused.value = false
    orchestraNotePreviewActive.value = false
    clearPlaybackIndicator()
  }
}

/**
 * 检测当前设备是否为 iPad。
 * 兼容 iPadOS 13+ 的桌面站点模式（navigator.platform 返回 "MacIntel"）。
 * @returns 是否为 iPad 设备
 */
function detectIpadDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent ?? ''
  const platformValue = String((navigator as Navigator & { platform?: string }).platform ?? '')
  return /iPad/i.test(ua) || (platformValue === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * 判断当前是否允许 iPad 翻页滑动手势。
 * 条件：iPad 设备、翻页模式、有乐谱页面、不在加载中、视口未缩放。
 * @returns 手势是否可用
 */
function canHandlePageSwipe(): boolean {
  return (
    isiPad.value &&
    viewMode.value === 'page' &&
    pagesSvg.value.length > 0 &&
    !loading.value &&
    !pageViewportZoomed.value
  )
}

/** 重置滑动状态，清除方向锁定和偏移量。 */
function resetSwipeState() {
  swipeActive.value = false
  swipeLock.value = 'none'
  swipeDeltaX.value = 0
  swipeDeltaY.value = 0
}

/**
 * 按容器尺寸和设备像素比 (DPR) 适配火花画布大小。
 * 画布绘制使用物理像素，CSS 尺寸使用逻辑像素。
 */
function resizeSwipeSparkCanvas() {
  const canvas = pageSwipeCanvasRef.value
  const host = pageSwipeHostRef.value
  if (!canvas || !host) return
  const rect = host.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
  const nextWidth = Math.round(rect.width * dpr)
  const nextHeight = Math.round(rect.height * dpr)
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }
}

/** 清空火花粒子画布上的所有内容。 */
function clearSwipeSparkCanvas() {
  const canvas = pageSwipeCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

/** 停止火花粒子动画循环（取消 rAF）。 */
function stopSwipeSparkLoop() {
  if (swipeSparkRafId !== null) {
    cancelAnimationFrame(swipeSparkRafId)
    swipeSparkRafId = null
  }
}

/**
 * 启动火花粒子动画循环。
 * 使用 requestAnimationFrame 持续渲染，当滑动手势结束且粒子全部消失后自动停止。
 */
function ensureSwipeSparkLoop() {
  if (swipeSparkRafId !== null) return
  swipeSparkLastFrameAt = performance.now()
  const tick = (now: number) => {
    renderSwipeSparkFrame(now)
    if (!swipeActive.value && swipeSparkParticles.length === 0) {
      stopSwipeSparkLoop()
      clearSwipeSparkCanvas()
      return
    }
    swipeSparkRafId = requestAnimationFrame(tick)
  }
  swipeSparkRafId = requestAnimationFrame(tick)
}

/**
 * 绘制并更新一帧火花粒子动画。
 * 每个粒子有独立的坐标、速度、生命周期、颜色（HSL），
 * 使用径向渐变绘制发光效果。帧时间差用于平滑运动补偿。
 * @param now - performance.now() 返回的当前时间戳
 */
function renderSwipeSparkFrame(now: number) {
  const canvas = pageSwipeCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const deltaMs = Math.min(34, Math.max(8, now - swipeSparkLastFrameAt))
  swipeSparkLastFrameAt = now
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const nextParticles: SwipeSparkParticle[] = []
  for (const particle of swipeSparkParticles) {
    particle.life -= deltaMs
    if (particle.life <= 0) continue
    const step = deltaMs / 16.666
    particle.x += particle.vx * step
    particle.y += particle.vy * step
    particle.vx *= 0.98
    particle.vy = particle.vy * 0.985 + 0.03 * step

    const alpha = Math.max(0, particle.life / particle.maxLife)
    const radius = particle.size * (0.72 + alpha * 1.25) * dpr
    const px = particle.x * dpr
    const py = particle.y * dpr
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius)
    gradient.addColorStop(
      0,
      `hsla(${particle.hue}, ${particle.saturation}%, ${Math.min(98, particle.lightness + 26)}%, ${Math.min(1, 1 * alpha)})`,
    )
    gradient.addColorStop(
      0.5,
      `hsla(${particle.hue}, ${Math.max(82, particle.saturation - 6)}%, ${particle.lightness}%, ${0.78 * alpha})`,
    )
    gradient.addColorStop(
      1,
      `hsla(${particle.hue}, ${Math.max(72, particle.saturation - 12)}%, ${Math.max(48, particle.lightness - 6)}%, 0)`,
    )
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()

    nextParticles.push(particle)
  }
  swipeSparkParticles = nextParticles
}

/**
 * 按手指移动速度发射彩色火花粒子。
 * 色相围绕霓虹锚点、高饱和度；粒子更大、更密，形成更醒目的跟随彩带。
 * 粒子数控制在 420 个以内，超出时移除最早生成的粒子。
 * @param x - 触摸点在容器内的 X 坐标
 * @param y - 触摸点在容器内的 Y 坐标
 * @param speed - 手指移动速度（px/s），速度越快粒子越多
 */
function emitSwipeSparkBurst(x: number, y: number, speed: number) {
  const burst = Math.max(7, Math.min(22, Math.round(7 + speed / 95)))
  for (let i = 0; i < burst; i += 1) {
    const driftX = (Math.random() - 0.5) * 36
    const driftY = (Math.random() - 0.5) * 26
    const angle = (Math.random() - 0.5) * 1.35
    const velocity = 1.1 + Math.random() * 3.4 + speed * 0.0065
    const baseHue = SWIPE_SPARK_HUE_ANCHORS[Math.floor(Math.random() * SWIPE_SPARK_HUE_ANCHORS.length)]!
    const hue = (baseHue + (Math.random() - 0.5) * 42 + 360) % 360
    const saturation = 94 + Math.random() * 6
    const lightness = 58 + Math.random() * 18
    const life = 240 + Math.random() * 320
    swipeSparkParticles.push({
      x: x + driftX,
      y: y + driftY,
      vx: Math.cos(angle) * velocity + (Math.random() - 0.5) * 1,
      vy: Math.sin(angle) * velocity + (Math.random() - 0.5) * 0.75,
      life,
      maxLife: life,
      size: 5.2 + Math.random() * 8.4,
      hue,
      saturation,
      lightness,
    })
  }
  if (swipeSparkParticles.length > 420) {
    swipeSparkParticles.splice(0, swipeSparkParticles.length - 420)
  }
}

/**
 * iPad 翻页滑动手势 touchstart 处理。
 * 记录手势起点坐标、时间戳，初始化/调整火花画布，启动粒子动画。
 * 点击标注元素时不触发手势。
 * @param ev - 原生 TouchEvent
 */
function onPageSwipeStart(ev: TouchEvent) {
  if (!canHandlePageSwipe() || ev.touches.length !== 1) return
  const target = ev.target as HTMLElement | null
  if (target?.closest('.score-annotation')) return
  resizeSwipeSparkCanvas()
  const touch = ev.touches[0]
  const currentTarget = ev.currentTarget as HTMLElement | null
  const rect = currentTarget?.getBoundingClientRect()
  swipeActive.value = true
  swipeLock.value = 'none'
  swipeStartX.value = touch.clientX
  swipeStartY.value = touch.clientY
  swipeDeltaX.value = 0
  swipeDeltaY.value = 0
  swipeLastTouchX.value = rect ? touch.clientX - rect.left : touch.clientX
  swipeLastTouchY.value = rect ? touch.clientY - rect.top : touch.clientY
  swipeLastTouchTime.value = performance.now()
  swipeSparkLastEmitAt = 0
  ensureSwipeSparkLoop()
}

/**
 * iPad 翻页滑动手势 touchmove 处理。
 * 计算滑动偏移量和手指速度，按固定间隔发射火花粒子。
 * 移动超过阈值后锁定方向（水平/垂直），水平方向阻止默认滚动。
 * @param ev - 原生 TouchEvent
 */
function onPageSwipeMove(ev: TouchEvent) {
  if (!swipeActive.value || ev.touches.length !== 1) return
  const touch = ev.touches[0]
  swipeDeltaX.value = touch.clientX - swipeStartX.value
  swipeDeltaY.value = touch.clientY - swipeStartY.value
  const target = ev.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  const localX = rect ? touch.clientX - rect.left : touch.clientX
  const localY = rect ? touch.clientY - rect.top : touch.clientY
  const now = performance.now()
  const deltaMs = Math.max(1, now - swipeLastTouchTime.value)
  const dx = localX - swipeLastTouchX.value
  const dy = localY - swipeLastTouchY.value
  const speed = (Math.hypot(dx, dy) / deltaMs) * 1000
  if (now - swipeSparkLastEmitAt >= SPARK_EMIT_INTERVAL_MS) {
    emitSwipeSparkBurst(localX, localY, speed)
    swipeSparkLastEmitAt = now
  }
  swipeLastTouchX.value = localX
  swipeLastTouchY.value = localY
  swipeLastTouchTime.value = now

  if (swipeLock.value === 'none') {
    const absX = Math.abs(swipeDeltaX.value)
    const absY = Math.abs(swipeDeltaY.value)
    if (absX >= SWIPE_LOCK_THRESHOLD_PX || absY >= SWIPE_LOCK_THRESHOLD_PX) {
      swipeLock.value = absX > absY * 1.1 ? 'horizontal' : 'vertical'
    }
  }
  if (swipeLock.value === 'horizontal') {
    ev.preventDefault()
  }
}

/**
 * iPad 翻页滑动手势 touchend 处理。
 * 若水平滑动距离超过 SWIPE_TRIGGER_PX（72px）且方向为水平，
 * 则执行翻页（左滑下一页，右滑上一页）。
 */
function onPageSwipeEnd() {
  if (!swipeActive.value) return
  const shouldFlip =
    swipeLock.value === 'horizontal' &&
    Math.abs(swipeDeltaX.value) >= SWIPE_TRIGGER_PX &&
    Math.abs(swipeDeltaX.value) > Math.abs(swipeDeltaY.value)
  if (shouldFlip) {
    if (swipeDeltaX.value < 0) {
      goNext({ hideChrome: false })
    } else {
      goPrev({ hideChrome: false })
    }
  }
  resetSwipeState()
  ensureSwipeSparkLoop()
}

/**
 * iPad 翻页滑动手势 touchcancel 处理。
 * 复位滑动状态，继续粒子动画（粒子会自然消散）。
 */
function onPageSwipeCancel() {
  resetSwipeState()
  ensureSwipeSparkLoop()
}

/**
 * 跳转到指定页码，自动夹紧到 [1, totalPages] 范围。
 * 仅在页码变化时播放翻页音效、收起面板、隐藏工具栏。
 * @param n - 目标页码（支持小数，会自动取整）
 */
function goToPage(n: number) {
  const max = totalPages.value
  if (max < 1) return
  const clamped = Math.max(1, Math.min(max, Math.floor(n)))
  const changed = currentPage.value !== clamped
  if (changed) {
    playPageTurnAudio()
    annotationPanelExpanded.value = false
    collapseFileToolPanel()
    hideScoreChromeForPageTurn()
  }
  currentPage.value = clamped
  if (changed) {
    schedulePersistCurrentCacheState()
  }
}

/**
 * 同步底部页码输入框的草稿值。
 * @param value - 用户正在输入的页码字符串
 */
function onPageDraftInput(value: string) {
  pageDraft.value = value
}

/**
 * 提交页码跳转（用户按 Enter 或 blur 时触发）。
 * 将输入框内容解析为整数并跳转，无效输入则恢复当前页码。
 */
function commitPageJump() {
  const raw = pageDraft.value.trim()
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) {
    pageDraft.value = String(currentPage.value)
    return
  }
  goToPage(n)
  pageDraft.value = String(currentPage.value)
}

/**
 * 判断拖放数据是否来自本地文件（兼容部分环境下 types 为 DOMStringList）。
 */
function isFileDragTransfer(dt: DataTransfer | null | undefined): boolean {
  if (!dt?.types) return false
  const types = dt.types
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true
  }
  return false
}

function hideScoreFileDropOverlay() {
  scoreFileDropOverlayVisible.value = false
}

/**
 * 系统拖放结束时兜底关闭提示层（例如拖到页外松手）。
 */
function onWindowScoreFileDragEnd(ev: DragEvent) {
  if (!isFileDragTransfer(ev.dataTransfer)) return
  hideScoreFileDropOverlay()
}

/**
 * 文件拖入本页任意区域时显示「松手打开」提示。
 */
function onScoreFileDragEnter(ev: DragEvent) {
  if (!isFileDragTransfer(ev.dataTransfer)) return
  scoreFileDropOverlayVisible.value = true
}

/**
 * 仅当指针真正离开本页根节点时才收起提示（进入子节点不视为离开）。
 */
function onScoreFileDragLeave(ev: DragEvent) {
  if (!isFileDragTransfer(ev.dataTransfer)) return
  const root = ev.currentTarget as Node | null
  if (!root) return
  const related = ev.relatedTarget as Node | null
  if (related && root.contains(related)) return
  hideScoreFileDropOverlay()
}

/**
 * 拖过页面时阻止默认行为，否则浏览器不会触发 drop。
 */
function onScoreFileDragOver(ev: DragEvent) {
  if (!isFileDragTransfer(ev.dataTransfer)) return
  ev.preventDefault()
}

/**
 * 将乐谱文件拖入页面后解析并打开（与「打开乐谱」选择文件共用同一套流程）。
 */
async function onScoreFileDrop(ev: DragEvent) {
  if (!isFileDragTransfer(ev.dataTransfer)) return
  ev.preventDefault()
  hideScoreFileDropOverlay()
  if (loading.value) return
  const file = ev.dataTransfer?.files?.[0]
  if (!file) return
  await openScoreFromUserFile(file)
}

/**
 * 从用户提供的单个 File 探测格式并加载乐谱（文件选择器与拖放共用）。
 */
async function openScoreFromUserFile(file: File) {
  const detectedSourceFormat = await detectSourceFormat(file)
  if (detectedSourceFormat === 'unknown') {
    error.value = '请选择 .mxl、.musicxml 或 .mei 格式的乐谱文件'
    return
  }
  await loadScoreFromOpenedFile(file, detectedSourceFormat)
}

/**
 * 触发隐藏的 file input 打开本地文件选择对话框。
 */
function triggerPick() {
  const input = fileInputRef.value
  if (!input) return
  input.accept = SCORE_FILE_ACCEPT
  input.click()
}

/** 切换右侧标注工具面板的展开/收起状态。 */
function toggleAnnotationPanel() {
  annotationPanelExpanded.value = !annotationPanelExpanded.value
}

/** 切换左侧文件工具面板的展开/收起状态。 */
function toggleFileToolPanel() {
  fileToolPanelExpanded.value = !fileToolPanelExpanded.value
}

/** 收起左侧文件工具面板。 */
function collapseFileToolPanel() {
  fileToolPanelExpanded.value = false
}

/**
 * 点击乐谱区域时收起侧栏面板；header / footer 保持常显，不再切换沉浸模式。
 * 通过事件冒泡触发，不拦截 ScorePinchViewport 内部的标注操作。
 */
function onScoreSurfaceClickDismissFileTools() {
  if (fileToolPanelExpanded.value) collapseFileToolPanel()
  if (annotationPanelExpanded.value && !annotationMode.value) {
    annotationPanelExpanded.value = false
  }
}

/**
 * 翻页后自动隐藏顶部和底部工具栏（Chrome）。
 * 仅在非标注模式且允许切换时生效。
 */
function hideScoreChromeForPageTurn() {
  if (!canToggleScoreChrome.value) return
  scoreChromeVisible.value = false
}

let cachedIonContentOffsetTop: string | null = null
let cachedIonContentOffsetBottom: string | null = null

/**
 * 强制覆盖 ion-content 的 CSS 偏移量。
 * 沉浸模式（工具栏隐藏）时将 offset 置零避免白色占位区；
 * 退出沉浸模式时恢复之前缓存的原始 offset 值。
 * @param immersive - 是否进入沉浸模式
 */
function syncIonContentOffsets(immersive: boolean) {
  const applyImmersiveOffsets = (host: HTMLElement) => {
    host.style.setProperty('--offset-top', '0px', 'important')
    host.style.setProperty('--offset-bottom', '0px', 'important')
  }
  nextTick(() => {
    const contentRef = scoreContentRef.value as
      | (InstanceType<typeof IonContent> & { $el?: HTMLElement })
      | HTMLElement
      | null
    const host = contentRef && '$el' in contentRef ? (contentRef.$el ?? null) : contentRef
    if (!host) return

    if (immersive) {
      if (cachedIonContentOffsetTop === null) {
        cachedIonContentOffsetTop = host.style.getPropertyValue('--offset-top')
      }
      if (cachedIonContentOffsetBottom === null) {
        cachedIonContentOffsetBottom = host.style.getPropertyValue('--offset-bottom')
      }
      applyImmersiveOffsets(host)
      requestAnimationFrame(() => applyImmersiveOffsets(host))
      return
    }

    if (cachedIonContentOffsetTop !== null) {
      host.style.setProperty('--offset-top', cachedIonContentOffsetTop)
      cachedIonContentOffsetTop = null
    } else {
      host.style.removeProperty('--offset-top')
    }
    if (cachedIonContentOffsetBottom !== null) {
      host.style.setProperty('--offset-bottom', cachedIonContentOffsetBottom)
      cachedIonContentOffsetBottom = null
    } else {
      host.style.removeProperty('--offset-bottom')
    }
  })
}

/**
 * 视口交互回调（来自 ScorePinchViewport）。
 * 缩放时自动收起文件工具和标注工具面板。
 * @param payload.type - 交互类型：'zoom' | 'drag' | 'tap'
 */
function onViewportActivity(payload: { type: 'zoom' | 'drag' | 'tap' }) {
  if (payload.type === 'zoom') {
    annotationPanelExpanded.value = false
    collapseFileToolPanel()
    scheduleRefreshPlaybackStaffLayout()
  }
}

/**
 * 分页视图缩放状态变化回调。
 * 放大后禁止滑动翻页（改为拖动画面），同时重置进行中的滑动状态。
 * @param payload.zoomed - 是否处于放大状态（scale > 1）
 */
function onPageViewportZoomStateChange(payload: { zoomed: boolean }) {
  pageViewportZoomed.value = payload.zoomed
  if (payload.zoomed && swipeActive.value) {
    resetSwipeState()
  }
  scheduleRefreshPlaybackStaffLayout()
}

/**
 * 清空当前页码的所有标注。
 */
function clearCurrentPageAnnotations() {
  annotations.value = annotations.value.filter((item) => item.page !== currentPage.value)
  schedulePersistCurrentCacheState()
}

/**
 * 按当前视图模式清空标注。
 * 滚动模式：清空全部标注；
 * 翻页模式：仅清空当前页的标注。
 */
function clearAnnotationsByViewMode() {
  collapseFileToolPanel()
  if (viewMode.value === 'scroll') {
    annotations.value = []
    schedulePersistCurrentCacheState()
    return
  }
  clearCurrentPageAnnotations()
}

function onAnnotationDraftTextChange(value: string) {
  annotationDraftText.value = value
  scoreUiStore.setSelectedAnnotationShortcut(isInstrumentAnnotationShortcut(value) ? value : '')
}

function getScoreAnnotationHitTestRoot(): HTMLElement | null {
  if (viewMode.value === 'scroll') {
    return scrollHostRef.value?.querySelector<HTMLElement>('.score-pinch-viewport') ?? scrollHostRef.value
  }
  return pageSwipeHostRef.value?.querySelector<HTMLElement>('.score-pinch-viewport') ?? pageSwipeHostRef.value
}

/**
 * 标注层用容器 (0–1) 定位；OSMD ink span 按谱面墨迹 (0–1) 归一化。
 * 锚点解析前将 x/y 转到墨迹坐标，避免左侧曲名/留白导致小节系统性偏移。
 */
function containerNormXYToInkNormForAnnotation(
  containerX: number,
  containerY: number,
  page1Based: number,
): { x: number; y: number } {
  const root = getScoreAnnotationHitTestRoot()
  const inner = root?.querySelector<HTMLElement>('.score-pinch-inner') ?? null
  if (!inner) {
    return { x: containerX, y: containerY }
  }
  let svg: SVGSVGElement | null = null
  if (viewMode.value === 'scroll') {
    const blocks = inner.querySelectorAll<HTMLElement>('.score-scroll-page-block')
    const idx = Math.max(0, Math.min(blocks.length - 1, Math.round(page1Based) - 1))
    svg = blocks[idx]?.querySelector('svg') ?? null
  } else {
    svg =
      inner.querySelector<SVGSVGElement>('.score-svg-layer svg') ??
      inner.querySelector<SVGSVGElement>('svg')
  }
  const ink = measurePageMusicInkClientRect(inner, svg)
  const rect = inner.getBoundingClientRect()
  if (!ink || rect.width <= 1 || rect.height <= 1) {
    return { x: containerX, y: containerY }
  }
  return mapContainerNormXYToInkNormXY(containerX, containerY, ink, rect)
}

/** 墨迹归一化 → 容器归一化，供 OSMD 重排版后把标注画回 overlay。 */
function inkNormXYToContainerNormForAnnotation(
  inkX: number,
  inkY: number,
  page1Based: number,
): { x: number; y: number } | null {
  const root = getScoreAnnotationHitTestRoot()
  const inner = root?.querySelector<HTMLElement>('.score-pinch-inner') ?? null
  if (!inner) return null
  let svg: SVGSVGElement | null = null
  if (viewMode.value === 'scroll') {
    const blocks = inner.querySelectorAll<HTMLElement>('.score-scroll-page-block')
    const idx = Math.max(0, Math.min(blocks.length - 1, Math.round(page1Based) - 1))
    svg = blocks[idx]?.querySelector('svg') ?? null
  } else {
    svg =
      inner.querySelector<SVGSVGElement>('.score-svg-layer svg') ??
      inner.querySelector<SVGSVGElement>('svg')
  }
  const ink = measurePageMusicInkClientRect(inner, svg)
  const rect = inner.getBoundingClientRect()
  if (!ink || rect.width <= 1 || rect.height <= 1) return null
  return mapInkNormXYToContainerNormXY(inkX, inkY, ink, rect)
}

async function realignOsmdAnnotationsToCurrentLayout(fractionById: Map<string, MeasureInkFraction> | null) {
  if (renderEngine.value !== 'osmd') return
  const bounds = osmdPageMeasureIndexBounds.value
  const spans = osmdPageMeasureInkNormSpans.value
  if (!bounds.length || spans.length !== bounds.length) return

  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  const prior = annotations.value.map((a) => ({ id: a.id, page: a.page, x: a.x, y: a.y }))
  annotations.value = realignOsmdAnnotationsAfterLayoutChange(
    annotations.value,
    bounds,
    spans,
    {
      ...(fractionById ? { fractionById } : {}),
      inkToContainer: inkNormXYToContainerNormForAnnotation,
      containerToInk: containerNormXYToInkNormForAnnotation,
    },
  )
  const moved = annotations.value.filter((a) => {
    const p = prior.find((x) => x.id === a.id)
    return p && (p.page !== a.page || Math.abs(p.x - a.x) > 1e-4 || Math.abs(p.y - a.y) > 1e-4)
  })
  bumpAnnotationLayoutEpoch()
  if (moved.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[osmd-layout] 标注重投影到小节墨迹: ${moved.length}/${annotations.value.length}`,
      moved.map((a) => ({
        id: a.id,
        measureIndex0: a.anchorMeasureListIndex0,
        page: a.page,
        x: a.x,
        y: a.y,
      })),
    )
  }
}

/** 为命中 Verovio 音符 id 并映射到 MIDI tick，确保已调用过 renderToMIDI 且总 tick/ms 可用 */
function ensureMidiTotalsForAnnotationAnchor(): boolean {
  if (renderEngine.value !== 'verovio' || !displayVerovioToolkit.value) return false
  if (currentMidiTotalTicks.value > 0 && currentMidiTotalMs.value > 0) return true
  try {
    const midi = displayVerovioToolkit.value.renderToMIDI()
    if (!midi.trim()) return false
    currentMidiBase64.value = midi
    const ticks = getMidiTotalTicksFromBase64(midi)
    currentMidiTotalTicks.value = ticks
    midiTempoMap.value = parseMidiTempoMap(midi)
    if (ticks > 0) {
      currentMidiTotalMs.value = ticksToMilliseconds(
        ticks,
        midiTempoMap.value?.ppq ?? 480,
        midiTempoMap.value?.events ?? [],
      )
    }
    return ticks > 0 && currentMidiTotalMs.value > 0
  } catch {
    return false
  }
}

/**
 * OSMD：在已解析锚定小节后，把标注位置固化为「相对该小节墨迹 span」的几何并写回 page/x/y。
 */
function applyOsmdMeasureAnchorLayoutToRecord(
  record: ScoreAnnotationRecord,
  measureIndex0: number,
  partIndex0: number | undefined,
  page1Based: number,
  inkNorm: { x: number; y: number },
): void {
  const bounds = osmdPageMeasureIndexBounds.value
  const spans = osmdPageMeasureInkNormSpans.value
  if (
    bounds.length !== pagesSvg.value.length ||
    spans.length !== pagesSvg.value.length ||
    bounds.length === 0
  ) {
    return
  }
  record.anchorMeasureListIndex0 = measureIndex0
  if (partIndex0 !== undefined) {
    record.anchorXmlPartIndex0 = partIndex0
  }
  const captured = captureOsmdMeasureLayoutForAnchor(
    measureIndex0,
    partIndex0,
    page1Based,
    bounds,
    spans,
    inkNorm,
  )
  if (!captured) return
  Object.assign(record, measureLayoutFieldsFromFraction(captured.fraction))
  const projected = projectOsmdAnnotationToContainer(record, bounds, spans, {
    inkToContainer: inkNormXYToContainerNormForAnnotation,
    fractionOverride: captured.fraction,
  })
  if (projected) {
    record.page = projected.page
    record.x = projected.x
    record.y = projected.y
  } else {
    record.page = captured.page
  }
}

/**
 * 新增标注回调（来自 ScorePinchViewport）。
 * 生成唯一 ID，关联当前页码和坐标，写入标注列表并延迟持久化。
 * @param payload.x - 点击位置在视口内的归一化 X（0~1）
 * @param payload.y - 点击位置在视口内的归一化 Y（0~1）
 * @param payload.page - 滚动模式下携带的页码
 * @param payload.clientX - 屏幕 X，用于 Verovio 锚点
 * @param payload.clientY - 屏幕 Y，用于 Verovio 锚点
 */
function onAddAnnotation(payload: {
  x: number
  y: number
  page?: number
  clientX?: number
  clientY?: number
}) {
  const rawText = annotationDraftText.value.trim()
  const text = formatAnnotationText(rawText)
  if (!text) {
    error.value = '请先输入标注文字'
    return
  }
  const icon = isInstrumentAnnotationShortcut(rawText) ? getInstrumentAnnotationIcon(rawText) : ''
  const iconShortcut = isInstrumentAnnotationShortcut(rawText) ? formatAnnotationText(rawText) : undefined

  let anchorTickStart: number | undefined
  let anchorMeasureListIndex0: number | undefined
  let anchorXmlPartIndex0: number | undefined
  let anchorElementId: string | undefined
  let anchorDbgBounds: string | undefined
  if (
    Number.isFinite(payload.clientX) &&
    Number.isFinite(payload.clientY) &&
    ensureMidiTotalsForAnnotationAnchor() &&
    displayVerovioToolkit.value
  ) {
    const root = getScoreAnnotationHitTestRoot()
    const tk = displayVerovioToolkit.value
    if (root) {
      const id = findNotationXmlIdUnderPoint(payload.clientX!, payload.clientY!, root, (xmlId) => {
        try {
          return tk.getTimeForElement(xmlId) >= 0
        } catch {
          return false
        }
      })
      if (id) {
        anchorElementId = id
        const ms = resolveVerovioElementStartMs(tk, id, currentMidiTotalMs.value)
        if (ms !== null) {
          anchorTickStart = millisecondsToTickLinear(ms, currentMidiTotalMs.value, currentMidiTotalTicks.value)
        }
      }
    }
  } else if (
    renderEngine.value === 'osmd' &&
    currentScoreXmlForExport.value.trim().length > 0 &&
    pagesSvg.value.length > 0
  ) {
    const pg = Number.isFinite(payload.page) ? (payload.page as number) : currentPage.value
    const bounds =
      osmdPageMeasureIndexBounds.value.length === pagesSvg.value.length
        ? osmdPageMeasureIndexBounds.value
        : null
    const inkSpans =
      osmdPageMeasureInkNormSpans.value.length === pagesSvg.value.length
        ? osmdPageMeasureInkNormSpans.value
        : null
    const systemBounds =
      osmdPageMusicSystemNormBounds.value.length === pagesSvg.value.length
        ? osmdPageMusicSystemNormBounds.value
        : null
    const inkNorm = containerNormXYToInkNormForAnnotation(payload.x, payload.y, pg)
    const resolved = resolveViewportAnnotationAnchorOnScoreXml(
      currentScoreXmlForExport.value,
      { page: pg, x: inkNorm.x, y: inkNorm.y },
      pagesSvg.value.length,
      bounds,
      inkSpans,
      systemBounds,
    )
    if (resolved) {
      anchorTickStart = resolved.tickStart
      anchorMeasureListIndex0 = resolved.measureIndex0
      anchorXmlPartIndex0 = resolved.anchorXmlPartIndex0
    }

    // 诊断：记录点击所在页的小节区间、inkSpan 数量与前3后2个 span 样本，导出时写入 fls:dbgBounds 辅助排查
    anchorDbgBounds = undefined
    if (bounds && bounds.length > 0 && pg >= 1 && pg <= bounds.length) {
      const b = bounds[pg - 1]!
      const ic = (inkSpans?.[pg - 1]?.length ?? 0)
      let sample = ''
      if (inkSpans && ic > 0) {
        const pageSpans = inkSpans[pg - 1]!
        const head = pageSpans.slice(0, 3).map(s => `${s.measureListIndex}:${s.left.toFixed(3)}-${s.right.toFixed(3)}`).join('|')
        const tail = pageSpans.slice(-2).map(s => `${s.measureListIndex}:${s.left.toFixed(3)}-${s.right.toFixed(3)}`).join('|')
        sample = `[${head}]...[${tail}]`
      }
      anchorDbgBounds = `${b.start},${b.end},${ic}${sample ? ' ' + sample : ''}`
    }
    annotationDebugLog('add:osmd-anchor', {
      text,
      page: pg,
      totalPages: pagesSvg.value.length,
      norm: { x: payload.x, y: payload.y },
      inkNorm,
      client: { x: payload.clientX, y: payload.clientY },
      resolved: resolved ?? null,
      pageBounds: bounds?.[pg - 1] ?? null,
      inkSpanCountOnPage: inkSpans?.[pg - 1]?.length ?? 0,
      inkSpansOnPageSample: inkSpans?.[pg - 1]?.slice(0, 12) ?? [],
    })
  } else {
    annotationDebugLog('add:no-osmd-anchor-branch', {
      text,
      renderEngine: renderEngine.value,
      page: Number.isFinite(payload.page) ? payload.page : currentPage.value,
      norm: { x: payload.x, y: payload.y },
      hasClientXY: Number.isFinite(payload.clientX) && Number.isFinite(payload.clientY),
      verovioHitTestEligible:
        renderEngine.value === 'verovio' &&
        Number.isFinite(payload.clientX) &&
        Number.isFinite(payload.clientY) &&
        !!displayVerovioToolkit.value,
    })
  }

  if (renderEngine.value === 'verovio') {
    annotationDebugLog('add:verovio-anchor-summary', {
      text,
      page: Number.isFinite(payload.page) ? payload.page : currentPage.value,
      norm: { x: payload.x, y: payload.y },
      client: { x: payload.clientX, y: payload.clientY },
      anchorElementId: anchorElementId ?? null,
      anchorTickStart: anchorTickStart ?? null,
      hasDisplayToolkit: !!displayVerovioToolkit.value,
    })
  }

  error.value = ''
  const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const pg0 = Number.isFinite(payload.page) ? (payload.page as number) : currentPage.value
  const newRecord: ScoreAnnotationRecord = {
    id: newId,
    page: pg0,
    x: payload.x,
    y: payload.y,
    text,
    color: annotationColor.value,
    ...(icon ? { icon } : {}),
    ...(iconShortcut ? { iconShortcut } : {}),
    ...(anchorTickStart !== undefined ? { anchorTickStart } : {}),
    ...(anchorMeasureListIndex0 !== undefined ? { anchorMeasureListIndex0 } : {}),
    ...(anchorXmlPartIndex0 !== undefined ? { anchorXmlPartIndex0 } : {}),
    ...(anchorElementId ? { anchorElementId } : {}),
    ...(anchorDbgBounds ? { _dbgBounds: anchorDbgBounds } : {}),
  }
  if (
    renderEngine.value === 'osmd' &&
    anchorMeasureListIndex0 != null &&
    anchorMeasureListIndex0 >= 0 &&
    osmdPageMeasureInkNormSpans.value.length === pagesSvg.value.length &&
    osmdPageMeasureIndexBounds.value.length === pagesSvg.value.length
  ) {
    const inkNorm = containerNormXYToInkNormForAnnotation(payload.x, payload.y, pg0)
    applyOsmdMeasureAnchorLayoutToRecord(
      newRecord,
      anchorMeasureListIndex0,
      anchorXmlPartIndex0,
      pg0,
      inkNorm,
    )
  }
  annotations.value.push(newRecord)
  bumpAnnotationLayoutEpoch()
  annotationDebugLog('add:pushed', {
    id: newId,
    text,
    page: newRecord.page,
    x: newRecord.x,
    y: newRecord.y,
    color: annotationColor.value,
    anchorTickStart,
    anchorMeasureListIndex0: newRecord.anchorMeasureListIndex0,
    anchorXmlPartIndex0: newRecord.anchorXmlPartIndex0,
    anchorMeasureFracX: newRecord.anchorMeasureFracX,
    anchorMeasureDomInkYNorm: newRecord.anchorMeasureDomInkYNorm,
    anchorElementId,
    renderEngine: renderEngine.value,
  })
  collapseFileToolPanel()
  schedulePersistCurrentCacheState()
}

/**
 * 移动标注回调（来自 ScorePinchViewport 的拖拽操作）。
 * 更新标注的位置坐标，滚动模式下支持跨页拖拽更新 page。
 * @param payload.id - 被拖拽的标注 ID
 * @param payload.x - 新的归一化 X 坐标
 * @param payload.y - 新的归一化 Y 坐标
 * @param payload.page - 滚动模式下更新后的页码
 */
function onMoveAnnotation(payload: { id: string; x: number; y: number; page?: number }) {
  const target = annotations.value.find((item) => item.id === payload.id)
  if (!target) return
  if (Number.isFinite(payload.page)) {
    target.page = payload.page as number
  }
  target.x = payload.x
  target.y = payload.y
  if (
    renderEngine.value === 'osmd' &&
    currentScoreXmlForExport.value.trim().length > 0 &&
    pagesSvg.value.length > 0
  ) {
    const pg = Number.isFinite(payload.page) ? (payload.page as number) : target.page
    const bounds =
      osmdPageMeasureIndexBounds.value.length === pagesSvg.value.length
        ? osmdPageMeasureIndexBounds.value
        : null
    const inkSpans =
      osmdPageMeasureInkNormSpans.value.length === pagesSvg.value.length
        ? osmdPageMeasureInkNormSpans.value
        : null
    const systemBounds =
      osmdPageMusicSystemNormBounds.value.length === pagesSvg.value.length
        ? osmdPageMusicSystemNormBounds.value
        : null
    const inkNorm = containerNormXYToInkNormForAnnotation(payload.x, payload.y, pg)
    const resolved = resolveViewportAnnotationAnchorOnScoreXml(
      currentScoreXmlForExport.value,
      { page: pg, x: inkNorm.x, y: inkNorm.y },
      pagesSvg.value.length,
      bounds,
      inkSpans,
      systemBounds,
    )
    if (resolved) {
      target.anchorTickStart = resolved.tickStart
      target.anchorMeasureListIndex0 = resolved.measureIndex0
      target.anchorXmlPartIndex0 = resolved.anchorXmlPartIndex0
      applyOsmdMeasureAnchorLayoutToRecord(
        target,
        resolved.measureIndex0,
        resolved.anchorXmlPartIndex0,
        pg,
        inkNorm,
      )
    } else if (
      target.anchorMeasureListIndex0 != null &&
      target.anchorMeasureListIndex0 >= 0 &&
      osmdPageMeasureInkNormSpans.value.length === pagesSvg.value.length &&
      osmdPageMeasureIndexBounds.value.length === pagesSvg.value.length
    ) {
      applyOsmdMeasureAnchorLayoutToRecord(
        target,
        target.anchorMeasureListIndex0,
        target.anchorXmlPartIndex0,
        pg,
        inkNorm,
      )
    }
    annotationDebugLog('move:osmd-anchor', {
      id: payload.id,
      text: target.text,
      page: pg,
      totalPages: pagesSvg.value.length,
      norm: { x: payload.x, y: payload.y },
      resolved: resolved ?? null,
      pageBounds: bounds?.[pg - 1] ?? null,
      inkSpanCountOnPage: inkSpans?.[pg - 1]?.length ?? 0,
    })
  }
  annotationDebugLog('move:updated', {
    id: payload.id,
    text: target.text,
    page: target.page,
    x: target.x,
    y: target.y,
    anchorTickStart: target.anchorTickStart,
    anchorMeasureListIndex0: target.anchorMeasureListIndex0,
    anchorXmlPartIndex0: target.anchorXmlPartIndex0,
    renderEngine: renderEngine.value,
  })
  bumpAnnotationLayoutEpoch()
  collapseFileToolPanel()
  schedulePersistCurrentCacheState()
}

/**
 * 删除标注回调（长按/双击触发）。
 * 弹出确认对话框，确认后从列表中移除并延迟持久化。
 * @param payload.id - 要删除的标注 ID
 */
function onRemoveAnnotation(payload: {
  id: string
  source?: 'long-press' | 'double-click'
}) {
  const target = annotations.value.find((item) => item.id === payload.id)
  if (!target) return
  const ok = window.confirm(`删除标注“${target.text}”？`)
  if (!ok) return
  annotations.value = annotations.value.filter((item) => item.id !== payload.id)
  collapseFileToolPanel()
  schedulePersistCurrentCacheState()
}

/**
 * 导出带内嵌标注的 MusicXML 文件。
 * 将标注写入标准 `<direction><words>…</words></direction>`（首声部对应小节），
 * 并在同一 `<direction>` 上使用 `xmlns:fls` 命名空间属性保存页码、坐标、原文与乐器快捷键；
 * 若 XML 无法被 DOM 解析则回退为仅追加旧版注释块。
 * 文件名格式为 `{原文件名}_{timestamp}.musicxml`。
 */
/** 导出前按当前 ink span 刷新小节相对几何，写入 fls:fracX / fls:inkDeltaY。 */
function annotationsSyncedForMusicXmlExport(): ScoreAnnotationRecord[] {
  if (renderEngine.value !== 'osmd') return annotations.value
  const bounds = osmdPageMeasureIndexBounds.value
  const spans = osmdPageMeasureInkNormSpans.value
  if (!bounds.length || spans.length !== pagesSvg.value.length) return annotations.value
  return annotations.value.map((ann) => {
    if (ann.anchorMeasureListIndex0 == null || ann.anchorMeasureListIndex0 < 0) return ann
    const projected = projectOsmdAnnotationToContainer(ann, bounds, spans, {
      inkToContainer: inkNormXYToContainerNormForAnnotation,
      containerToInk: containerNormXYToInkNormForAnnotation,
    })
    if (!projected) return ann
    return {
      ...ann,
      page: projected.page,
      x: projected.x,
      y: projected.y,
      ...measureLayoutFieldsFromFraction(projected.fraction),
    }
  })
}

function exportAnnotatedMusicXml() {
  if (!canExportAnnotatedMusicXml.value) {
    error.value = '当前乐谱没有可导出的 MusicXML 源数据，请重新打开原始文件'
    return
  }
  const totalPages = Math.max(1, pagesSvg.value.length)
  const exportXml = (currentVerovioSourceXml.value || currentScoreXmlForExport.value).trim()
  const exportOpts = {
    verovioPageWidth: verovioPageWidth.value,
    osmdPageWidth: exportXml
      ? resolveOsmdLayoutHostWidthPx(mergeOsmdPageFormatOptions(exportXml, buildOsmdRenderOptions(exportXml)).pageWidth)
      : osmdPageWidth.value,
    renderEngine: renderEngine.value,
    totalPages,
    osmdManualPageWidthTenths: osmdManualPageWidthTenths.value,
    osmdManualPageHeightTenths: osmdManualPageHeightTenths.value,
    rendererPageMeasureBounds:
      renderEngine.value === 'osmd' &&
      osmdPageMeasureIndexBounds.value.length === pagesSvg.value.length
        ? osmdPageMeasureIndexBounds.value
        : undefined,
    rendererPageMeasureInkNormSpans:
      renderEngine.value === 'osmd' &&
      osmdPageMeasureInkNormSpans.value.length === pagesSvg.value.length
        ? osmdPageMeasureInkNormSpans.value
        : undefined,
    rendererPageMusicSystemNormBounds:
      renderEngine.value === 'osmd' &&
      osmdPageMusicSystemNormBounds.value.length === pagesSvg.value.length
        ? osmdPageMusicSystemNormBounds.value
        : undefined,
  }
  annotationDebugLog('export:start', {
    fileName: fileName.value,
    annotationCount: annotations.value.length,
    xmlLen: currentScoreXmlForExport.value.length,
    ...exportOpts,
    annotationsPreview: annotationsSyncedForMusicXmlExport().map((a) => ({
      id: a.id,
      text: a.text,
      page: a.page,
      x: a.x,
      y: a.y,
      anchorMeasureListIndex0: a.anchorMeasureListIndex0,
      anchorXmlPartIndex0: a.anchorXmlPartIndex0,
      anchorTickStart: a.anchorTickStart,
    })),
  })
  const out = withEmbeddedAnnotations(
    currentScoreXmlForExport.value,
    annotationsSyncedForMusicXmlExport(),
    exportOpts,
  )
  annotationDebugLog('export:done', {
    fileName: fileName.value,
    outLen: out.length,
    annotationCount: annotations.value.length,
    totalPages,
    renderEngine: renderEngine.value,
  })
  const safeBase = (fileName.value || 'score').replace(/\.[^.]+$/, '')
  const blob = new Blob([out], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeBase}_${dateFormat(new Date(), 'yyyyMMddHHmmss')}.musicxml`
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * 从文件对象加载乐谱并渲染（核心渲染流程）。
 * 1. 计算文件 SHA-256 + 排版参数 → 生成缓存键
 * 2. 检查 IndexedDB 缓存：命中则直接恢复状态
 * 3. 缓存未命中：根据格式（MXL/XML/MEI）解析为纯 MusicXML
 * 4. 调用 Verovio/OSMD 引擎渲染为 SVG 页面数组
 * 5. 解析内嵌标注并恢复到视口
 * 6. 写入 IndexedDB 缓存
 * @param file - 用户选择的文件对象
 * @param detectedSourceFormat - 已探测到的源格式
 */
async function loadScoreFromOpenedFile(
  file: File,
  detectedSourceFormat: 'musicxml' | 'mxl' | 'mei',
): Promise<void> {
  let layoutVersion = ''
  let cacheKey = ''
  let fileHash = ''

  loading.value = true
  scoreLoadingStageIndex.value = 0
  error.value = ''
  clearOrchestraPlaybackState()
  pagesSvg.value = []
  osmdPageMeasureIndexBounds.value = []
  osmdPageMeasureInkNormSpans.value = []
  osmdPageMusicSystemNormBounds.value = []
  pageInkClientRects.value = []
  applyOsmdOrchestralLayoutState(null)
  annotations.value = []
  currentScoreXmlForExport.value = ''
  currentSourceFormat.value = detectedSourceFormat
  currentPage.value = 1
  pageDraft.value = '1'
  fileName.value = file.name
  annotationPanelExpanded.value = false
  scoreOpenedWithFlsUiComment.value = false

  try {
    fileHash = await getFileSha256Hex(file)

    let plainMusicXml = ''
    if (detectedSourceFormat === 'mxl') {
      const buf = await file.arrayBuffer()
      plainMusicXml = await mxlToMusicXmlString(buf)
    } else {
      plainMusicXml = await file.text()
    }

    const uiMeta = parseFiveLineStaffUiComment(plainMusicXml)
    const hadFlsUiCommentInOpenedFile = uiMeta != null

    if (uiMeta?.renderEngine === 'verovio' || uiMeta?.renderEngine === 'osmd') {
      if (renderEngine.value !== uiMeta.renderEngine) {
        renderEngine.value = uiMeta.renderEngine
      }
    }

    prepareOsmdPageLayoutStateForXml(plainMusicXml)

    layoutVersion =
      renderEngine.value === 'osmd'
        ? getOsmdLayoutVersionForXml()
        : getVerovioLayoutVersion()
    currentLayoutVersion.value = layoutVersion
    cacheKey = buildScoreCacheKey(fileHash, layoutVersion, renderEngine.value)

    await setScoreLoadingStage(1)
    const cached = await getScoreCache(cacheKey)
    if (cached?.pagesSvg?.length) {
      await setScoreLoadingStage(4)
      applyCachedState(cached, { hadFlsUiCommentInOpenedFile })
      await setLastOpenedCacheKey(cacheKey)
      await refreshCachedFiles()
      // triggerAutoPrepareOrchestraPlayback()
      return
    }

    scoreOpenedWithFlsUiComment.value = hadFlsUiCommentInOpenedFile

    await setScoreLoadingStage(2)
    let pages: string[] = []
    let parsedEmbedded = {
      annotations: [],
      verovioPageWidth: null,
      osmdPageWidth: null,
      renderEngine: null,
    } as ParsedEmbeddedAnnotations

    parsedEmbedded = canAnnotateInFileFormat.value
      ? parseScoreAnnotationsFromMusicXml(plainMusicXml)
      : { annotations: [], verovioPageWidth: null, osmdPageWidth: null, renderEngine: null }
    /** 渲染用：去掉内嵌标注 direction，否则 OSMD/Verovio 会把 words 画进 SVG，与 overlay 重复且位置按 default-x/y 与 fls 归一化坐标不一致 */
    const xmlForRender = canAnnotateInFileFormat.value
      ? stripAnnotationArtifacts(plainMusicXml)
      : plainMusicXml
    if (parsedEmbedded.renderEngine && parsedEmbedded.renderEngine !== renderEngine.value) {
      renderEngine.value = parsedEmbedded.renderEngine
      layoutVersion =
        renderEngine.value === 'osmd'
          ? getOsmdLayoutVersionForXml()
          : getVerovioLayoutVersion()
      cacheKey = buildScoreCacheKey(fileHash, layoutVersion, renderEngine.value)
      currentLayoutVersion.value = layoutVersion
      const recacheAfterEngine = await getScoreCache(cacheKey)
      if (recacheAfterEngine?.pagesSvg?.length) {
        await setScoreLoadingStage(4)
        applyCachedState(recacheAfterEngine, { hadFlsUiCommentInOpenedFile })
        await setLastOpenedCacheKey(cacheKey)
        await refreshCachedFiles()
        return
      }
    }
    await setScoreLoadingStage(3)
    if (renderEngine.value === 'verovio') {
      const {
        applyScreenLayoutOptions,
        createVerovioToolkit,
        extractPageBoundaryProgress,
        loadMusicXml,
        renderAllPagesSvg,
      } = await import('@/lib/verovio')

      const toolkit = await createVerovioToolkit()
      applyScreenLayoutOptions(toolkit, {
        pageWidth: verovioPageWidth.value,
        header: verovioShowHeader.value ? 'auto' : 'none',
        footer: verovioShowFooter.value ? 'auto' : 'none',
        inkColor: scoreInkColor.value,
      })
      const ok = loadMusicXml(toolkit, xmlForRender)

      if (!ok) {
        throw new Error('Verovio 无法解析该乐谱数据')
      }
      currentVerovioSourceXml.value = xmlForRender
      pages = renderAllPagesSvg(toolkit)
      // 保存 SVG 渲染 toolkit 供后续 getElementsAtTime 复用
      displayVerovioToolkit.value = toolkit
      // 提取每页播放进度边界
      const boundaries = extractPageBoundaryProgress(toolkit)
      playbackPageBoundaries.value = normalizePlaybackPageBoundaries(boundaries, pages.length)
      playbackSystemBoundariesByPage.value = []
      if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
        // eslint-disable-next-line no-console
        console.log('[load-score-verovio]:pre-semantics', {
          pages: pages.length,
          cacheKey,
          hasOrchestraReady: orchestraPlaybackReady.value,
          sourceXmlLen: xmlForRender.length,
          boundariesLen: playbackPageBoundaries.value.length,
          renderEngine: renderEngine.value,
          displayToolkitReady: !!displayVerovioToolkit.value,
          currentMidiTotalTicks: currentMidiTotalTicks.value,
          currentMidiBase64Len: currentMidiBase64.value.length,
        })
        console.log('[load-score-verovio]:layout-boundaries', {
          pageBoundariesLen: playbackPageBoundaries.value.length,
          pageBoundariesPreview: playbackPageBoundaries.value.slice(0, 10),
          systemBoundariesByPageLen: playbackSystemBoundariesByPage.value.length,
        })
        console.log('[load-score-verovio]:playback-prebind', {
          playbackToolkitReady: !!playbackVerovioToolkit.value,
          displayToolkitReady: !!displayVerovioToolkit.value,
          pageBoundaryProgressLen: playbackPageBoundaries.value.length,
          systemBoundaryProgressByPageLen: playbackSystemBoundariesByPage.value.length,
        })
      }
      playbackVerovioToolkit.value = toolkit
      rebuildSemanticPlaybackRows(toolkit, xmlForRender, 'load-score-verovio', currentMidiTotalTicks.value)
      orchestraDebugLog('info', '[orchestra-debug] load boundaries', {
        pages: pages.length,
        rawLen: boundaries.length,
        normalizedLen: playbackPageBoundaries.value.length,
        boundaries: playbackPageBoundaries.value,
        semanticRows: playbackSemanticRows.value.length,
      })
      osmdPageMeasureIndexBounds.value = []
      osmdPageMeasureInkNormSpans.value = []
      osmdPageMusicSystemNormBounds.value = []
      pageInkClientRects.value = []
    } else {
      if (detectedSourceFormat === 'mei') {
        throw new Error('OpenSheetMusicDisplay 暂不支持 .mei，请切换 Verovio 引擎')
      }
      currentVerovioSourceXml.value = xmlForRender
      const osmdPaged = await renderMusicXmlWithOsmdPages(
        xmlForRender,
        buildOsmdRenderOptionsFromFile(xmlForRender),
      )
      applyOsmdOrchestralLayoutState(osmdPaged.orchestralOneSystemLayout)
      syncOsmdManualPageDimensionsFromXml(
        xmlForRender,
        osmdPaged.orchestralOneSystemLayout,
      )
      pages = osmdPaged.pages
      osmdPageMeasureIndexBounds.value = osmdPaged.pageMeasureIndexBounds
      osmdPageMeasureInkNormSpans.value = osmdPaged.pageMeasureInkNormSpans
      osmdPageMusicSystemNormBounds.value = osmdPaged.pageMusicSystemNormBounds
      viewMode.value = 'page'
    }

    if (!pages.length) {
      throw new Error('乐谱未生成任何页面')
    }
    if (renderEngine.value === 'osmd') {
      layoutVersion = getOsmdLayoutVersionForXml()
      currentLayoutVersion.value = layoutVersion
      cacheKey = buildScoreCacheKey(fileHash, layoutVersion, renderEngine.value)
    }
    await setScoreLoadingStage(4)
    pagesSvg.value = pages
    scoreUiStore.resetAnnotationPresentationForNewScore()
    if (pages.length === 1) {
      viewMode.value = 'page'
    }
    currentPage.value = 1
    pageDraft.value = '1'
    selectedCacheKey.value = cacheKey
    annotations.value = parsedEmbedded.annotations
    if (renderEngine.value === 'osmd') {
      await realignOsmdAnnotationsToCurrentLayout(null)
    }
    currentScoreXmlForExport.value =
      canAnnotateInFileFormat.value && xmlForRender.trim().length > 0 ? xmlForRender : ''

    void putScoreCache({
      cacheKey,
      fileName: file.name,
      pagesSvg: pages,
      totalPages: pages.length,
      viewMode: viewMode.value as ScoreViewMode,
      currentPage: 1,
      annotations: annotations.value,
      hadFlsUiCommentOnOpen: scoreOpenedWithFlsUiComment.value,
      ...(currentScoreXmlForExport.value.trim().length > 0
        ? { musicXmlForExport: currentScoreXmlForExport.value }
        : {}),
      ...(playbackPageBoundaries.value.length === pages.length
        ? { pageBoundaryProgress: playbackPageBoundaries.value }
        : {}),
      ...(playbackSystemBoundariesByPage.value.length === pages.length
        ? { systemBoundaryProgressByPage: playbackSystemBoundariesByPage.value }
        : {}),
      ...(renderEngine.value === 'osmd' &&
      osmdPageMeasureIndexBounds.value.length === pages.length
        ? { osmdPageMeasureIndexBounds: osmdPageMeasureIndexBounds.value }
        : {}),
      ...(renderEngine.value === 'osmd' &&
      osmdPageMeasureInkNormSpans.value.length === pages.length
        ? { osmdPageMeasureInkNormSpans: osmdPageMeasureInkNormSpans.value }
        : {}),
      ...(renderEngine.value === 'osmd' &&
      osmdPageMusicSystemNormBounds.value.length === pages.length
        ? { osmdPageMusicSystemNormBounds: osmdPageMusicSystemNormBounds.value }
        : {}),
      semanticPlaybackRows: playbackSemanticRows.value,
      layoutVersion,
      ...(buildScoreCacheMidiFieldsFromMemory() ?? {}),
    })
      .then(() => {
        if (orchestraAlignmentDebugUiEnabled || orchestraDebugEnabled) {
          // eslint-disable-next-line no-console
          console.log('[semantic-cache-write]', {
            cacheKey,
            rows: playbackSemanticRows.value.length,
            pages: pages.length,
            phase: 'load-score',
          })
        }
      })
      .then(() =>
        Promise.all([setLastOpenedCacheKey(cacheKey), pruneScoreCache(10), refreshCachedFiles()]),
      )
      .catch((e) => {
        handleCacheFailure('写入', e)
      })
    // triggerAutoPrepareOrchestraPlayback()
  } catch (e) {
    logCaught('loadScoreFromOpenedFile failed', e)
    fileName.value = ''
    annotations.value = []
    osmdPageMeasureIndexBounds.value = []
    osmdPageMeasureInkNormSpans.value = []
    osmdPageMusicSystemNormBounds.value = []
    pageInkClientRects.value = []
    currentScoreXmlForExport.value = ''
    currentVerovioSourceXml.value = ''
    currentSourceFormat.value = 'unknown'
    currentPage.value = 1
    pageDraft.value = '1'
    scoreOpenedWithFlsUiComment.value = false
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    clearScoreLoadingStage()
  }
}

/**
 * 文件选择器 change 事件回调（打开文件入口）。
 * 1. 探测文件源格式（扩展名 → MIME → 文件头魔数）
 * 2. 若无法识别格式则提示错误
 * 3. 否则交由 loadScoreFromOpenedFile 完成解析、渲染、缓存
 * @param ev - input[type=file] 的 change 事件
 */
async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await openScoreFromUserFile(file)
}
</script>

<style scoped lang="scss">
.score-file-drop-fade-enter-active,
.score-file-drop-fade-leave-active {
  transition: opacity 0.2s ease;
}

.score-file-drop-fade-enter-from,
.score-file-drop-fade-leave-to {
  opacity: 0;
}

.score-file-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 35000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
  box-sizing: border-box;
}

.score-file-drop-overlay__veil {
  position: absolute;
  inset: 0;
  background: var(--color-overlay);
}

.score-file-drop-overlay__frame {
  position: absolute;
  inset: 12px;
  border: 3px dashed rgba(37, 99, 235, 0.92);
  border-radius: 16px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.1),
    0 0 0 1px rgba(37, 99, 235, 0.25);
}

.score-file-drop-overlay__card {
  position: relative;
  max-width: min(440px, 92vw);
  padding: 22px 26px;
  border-radius: 14px;
  background: var(--color-overlay-heavy);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
}

.score-file-drop-overlay__title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-dark);
  letter-spacing: 0.03em;
}

.score-file-drop-overlay__sub {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary-dark);
  line-height: 1.5;
}

.home-page--score-file-drag {
  outline: 2px solid rgba(37, 99, 235, 0.45);
  outline-offset: -2px;
}

.score-chrome-hidden {
  opacity: 0;
  pointer-events: none;
}

.score-chrome-hidden--header {
  transform: translateY(-100%);
}

:deep(.score-pager-footer) {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  transition: transform 220ms ease, opacity 220ms ease;
}

:deep(.score-pager-footer.score-chrome-hidden--footer) {
  transform: translateY(100%);
  opacity: 0;
  pointer-events: none;
}

.score-scroll {
  --scroll-padding: 0;
  overflow-x: hidden;

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .score-pages {
    position: relative;
    width: 100%;
    box-sizing: border-box;
    padding: 0 0 24px;
    overflow-x: hidden;
    transition:
      padding-right 220ms ease,
      width 220ms ease;

    &.score-pages--annotation-space-reserved {
      --annotation-panel-reserve-width: clamp(280px, 34vw, 390px);
      width: max(320px, calc(100% - var(--annotation-panel-reserve-width)));
      padding-right: 10px;
    }

    &--page {
      overflow: hidden;

      .playback-indicator-line {
        position: absolute;
        top: 0;
        bottom: 24px;
        width: 2px;
        background: var(--color-playback);
        box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
        z-index: 11;
        pointer-events: none;

        .playback-indicator-percent {
          position: absolute;
          top: 8px;
          left: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          padding: 2px 6px;
          border-radius: 999px;
          background: var(--color-overlay-heavy);
          color: var(--color-primary-contrast);
          font-size: 11px;
          font-weight: 600;
          line-height: 1.2;
          white-space: nowrap;
        }
      }

      .playback-debug-ticks {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 13;
        padding: 3px 8px;
        border-radius: 6px;
        background: var(--color-overlay-heavy);
        color: var(--color-primary-contrast);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        pointer-events: none;
      }

      .page-flip-flash {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 14;
        padding: 6px 10px;
        border-radius: 8px;
        background: var(--color-primary);
        color: var(--color-primary-contrast);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2px;
        pointer-events: none;
      }

      .swipe-spark-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: calc(100% - 24px);
        z-index: 12;
        pointer-events: none;
        mix-blend-mode: screen;
        filter: saturate(1.2) contrast(1.05);
      }
    }

    &--scroll {
      padding-bottom: 32px;

      .playback-indicator-line {
        position: absolute;
        top: 0;
        bottom: 24px;
        width: 2px;
        background: var(--color-playback);
        box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
        z-index: 11;
        pointer-events: none;

        .playback-indicator-percent {
          position: absolute;
          top: 8px;
          left: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          padding: 2px 6px;
          border-radius: 999px;
          background: var(--color-overlay-heavy);
          color: var(--color-primary-contrast);
          font-size: 11px;
          font-weight: 600;
          line-height: 1.2;
          white-space: nowrap;
        }
      }

      .playback-debug-ticks {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 13;
        padding: 3px 8px;
        border-radius: 6px;
        background: var(--color-overlay-heavy);
        color: var(--color-primary-contrast);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        pointer-events: none;
      }
    }
  }
}

.score-scroll--chrome-padding {
  /* header/footer 绝对定位后，为乐谱内容预留安全显示区域。 */
  --padding-top: calc(var(--ion-safe-area-top, 0px) + 52px);
  --padding-bottom: calc(var(--ion-safe-area-bottom, 0px) + 52px);
}

.score-scroll--immersive {
  /* 隐藏 header/footer 时同步移除 ion-content 的自动上下预留。 */
  --offset-top: 0px !important;
  --offset-bottom: 0px !important;
  --padding-top: 0px;
  --padding-bottom: 0px;
}

.playback-scroll-fixed-debug {
  position: fixed;
  top: calc(var(--ion-safe-area-top, 0px) + 60px);
  right: 12px;
  z-index: 30;
  display: inline-flex;
  gap: 8px;
  pointer-events: none;
}

.playback-scroll-fixed-debug-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--color-overlay-heavy);
  color: var(--color-primary-contrast);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}
</style>

