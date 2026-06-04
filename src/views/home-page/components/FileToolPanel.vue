<template>
  <div class="file-side-panel" :class="{ 'file-side-panel--expanded': expanded }">
    <transition name="file-side-slide">
      <div v-if="expanded" class="file-side-body">
        <!-- 切换视图模式 -->
        <div class="view-mode-segment" role="group" aria-label="视图模式">
          <button
            type="button"
            class="view-mode-btn"
            :class="{ 'view-mode-btn--active': viewMode === 'page' }"
            :disabled="loading"
            @click="emit('update:viewMode', 'page')"
          >
            翻页
          </button>
          <button
            type="button"
            class="view-mode-btn"
            :class="{ 'view-mode-btn--active': viewMode === 'scroll' }"
            :disabled="loading"
            @click="emit('update:viewMode', 'scroll')"
          >
            滚动
          </button>
        </div>
        <ion-button class="open-score-btn" :disabled="loading" @click="$emit('trigger-pick')">打开乐谱</ion-button>
        <!-- 已缓存文件列表 -->
        <ul
          v-if="filteredCachedFiles.length"
          class="cached-file-list"
          role="listbox"
          aria-label="已缓存文件"
        >
          <li
            v-for="item in filteredCachedFiles"
            :key="item.cacheKey"
            class="cached-file-item"
            :class="{ 'cached-file-item--active': item.cacheKey === selectedCacheKey }"
            role="option"
            :aria-selected="item.cacheKey === selectedCacheKey"
          >
            <button
              type="button"
              class="cached-file-name-btn"
              :disabled="loading"
              @click="emit('cached-file-select', item.cacheKey)"
            >
              {{ item.fileName }}
            </button>
            <button
              type="button"
              class="cached-file-remove-btn"
              :disabled="loading"
              :aria-label="`删除「${item.fileName}」缓存`"
              @click.stop="requestDeleteCachedFile(item)"
            >
              <ion-icon :icon="closeOutline" aria-hidden="true" />
            </button>
          </li>
        </ul>

        <ion-alert
          :is-open="deleteItemConfirmOpen"
          header="确认删除"
          :message="deleteItemConfirmMessage"
          :buttons="deleteItemConfirmButtons"
          @didDismiss="onDeleteItemConfirmDismiss"
        />
        
        <!-- 渲染引擎参数设置 -->
        <div class="verovio-layout-card">
          <p class="orchestra-playback-title">渲染引擎参数设置</p>
          <select
            class="engine-select"
            :value="renderEngine"
            :disabled="loading"
            aria-label="渲染引擎"
            @change="$emit('render-engine-select', ($event.target as HTMLSelectElement).value)"
          >
            <option value="osmd">OSMD渲染引擎（默认）</option>
            <!-- <option value="verovio">Verovio渲染引擎</option> -->
          </select>

          <!-- OSMD渲染引擎 -->
          <template v-if="renderEngine === 'osmd'">
            <label class="verovio-layout-field">
              <span class="verovio-layout-label">页面宽度 (tenths)</span>
              <input
                class="verovio-layout-input"
                type="number"
                min="100"
                max="20000"
                step="0.01"
                :value="osmdManualPageWidthTenths"
                :disabled="loading"
                @change="onOsmdManualPageWidthTenthsChange"
              />
            </label>
            <label class="verovio-layout-field">
              <span class="verovio-layout-label">页面高度 (tenths)</span>
              <input
                class="verovio-layout-input"
                type="number"
                min="100"
                max="20000"
                step="0.01"
                :value="osmdManualPageHeightTenths"
                :disabled="loading"
                @change="onOsmdManualPageHeightTenthsChange"
              />
            </label>
            <p v-if="osmdPageSizeWarn" class="osmd-dim-sub osmd-dim-sub--warn">
              {{ osmdPageSizeWarn }}
            </p>
            <p v-if="orchestralOneSystemHint" class="osmd-dim-sub osmd-dim-sub--info">
              {{ orchestralOneSystemHint }}
            </p>
            <ion-button fill="outline" :disabled="loading || !scoreReady" @click="$emit('apply-osmd-layout')">
              应用排版到当前乐谱
            </ion-button>
          </template>

          <!-- Verovio渲染引擎 -->
          <template v-if="renderEngine === 'verovio'">
            <label class="verovio-layout-field">
              <span class="verovio-layout-label">页面宽度</span>
              <input
                class="verovio-layout-input"
                type="number"
                min="600"
                max="10000"
                step="100"
                :value="verovioPageWidth"
                :disabled="loading"
                @change="onVerovioPageWidthChange"
              />
            </label>
            <label class="layout-option-check">
              <input
                type="checkbox"
                :disabled="loading"
                :checked="verovioShowHeader"
                @change="$emit('update:verovio-show-header', ($event.target as HTMLInputElement).checked)"
              />
              显示页眉信息（标题）
            </label>
            <label class="layout-option-check">
              <input
                type="checkbox"
                :disabled="loading"
                :checked="verovioShowFooter"
                @change="$emit('update:verovio-show-footer', ($event.target as HTMLInputElement).checked)"
              />
              显示页脚信息
            </label>
            <p class="score-theme-hint">
              五线谱颜色：{{ scoreThemeMode === 'dark' ? '白色' : '黑色' }}
            </p>
            <ion-button
              fill="outline"
              :disabled="loading"
              @click="$emit('toggle-score-theme-mode')"
            >
              切换五线谱颜色（当前{{ scoreThemeMode === 'dark' ? '白色' : '黑色' }}）
            </ion-button>
            <ion-button fill="outline" :disabled="loading || !scoreReady" @click="$emit('apply-verovio-layout')">
              应用排版到当前乐谱
            </ion-button>
          </template>
        </div>
       
        <!-- 交响乐演奏 -->
        <div v-if="scoreReady" class="orchestra-playback-card">
          <p class="orchestra-playback-title">交响乐演奏</p>
          <ion-button
            fill="outline"
            :disabled="loading || playbackLoading || playbackReady"
            @click="$emit('prepare-orchestra-playback')"
          >
            {{ playbackReady ? '音色库已就绪' : '准备乐器音色库' }}
          </ion-button>
          <div v-if="playbackLoading || prepareProgress > 0" class="prepare-progress-wrap">
            <div class="prepare-progress-label">
              <span>准备进度</span>
              <strong>{{ prepareProgress }}%</strong>
            </div>
            <div class="prepare-progress-track" role="progressbar" :aria-valuenow="prepareProgress" aria-valuemin="0" aria-valuemax="100">
              <div class="prepare-progress-fill" :style="{ width: `${prepareProgress}%` }" />
            </div>
          </div>
          <div v-if="playbackReady" class="orchestra-playback-actions">
            <ion-button
              :disabled="loading || playbackLoading || playbackPlaying"
              @click="$emit('play-orchestra')"
            >
              播放
            </ion-button>
            <ion-button
              fill="outline"
              :disabled="loading || playbackLoading || !playbackPlaying"
              @click="$emit('pause-orchestra')"
            >
              暂停
            </ion-button>
            <ion-button
              fill="outline"
              color="medium"
              :disabled="loading || playbackLoading"
              @click="$emit('stop-orchestra')"
            >
              停止
            </ion-button>
          </div>
          <p class="orchestra-source-hint">音色库来源：{{ playbackSourceHint }}</p>
        </div>

        <!-- 刷新/删除当前缓存 -->
        <div v-if="scoreReady" class="file-tool-score-actions">
          <ion-button
            v-if="viewMode === 'page'"
            :fill="pageTurnSoundEnabled ? 'solid' : 'outline'"
            :disabled="loading"
            @click="$emit('toggle-page-turn-sound')"
          >
            <ion-icon slot="start" :icon="volumeMuteOutline" aria-hidden="true" v-if="pageTurnSoundEnabled"/>
            <ion-icon slot="start" :icon="volumeHighOutline" aria-hidden="true" v-else/>

            {{ pageTurnSoundEnabled ? '关闭翻页声音' : '开启翻页声音' }}
          </ion-button>
          <ion-button
            v-if="viewMode === 'scroll'"
            :fill="scrollPlaybackAutoFollowEnabled ? 'solid' : 'outline'"
            :disabled="loading"
            @click="$emit('toggle-scroll-playback-auto-follow')"
          >
            <ion-icon
              v-if="scrollPlaybackAutoFollowEnabled"
              slot="start"
              :icon="banOutline"
              aria-hidden="true"
            />
            <ion-icon v-else slot="start" :icon="handRightOutline" aria-hidden="true" />
            {{ scrollPlaybackAutoFollowEnabled ? '关闭播放自动滚动' : '开启播放自动滚动' }}
          </ion-button>
          <ion-button
            expand="block"
            fill="outline"
            class="file-tool-text-btn"
            :disabled="loading"
            aria-label="刷新页面"
            @click="$emit('refreshPage')"
          >
            <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
            刷新页面
          </ion-button>
          <ion-button
            v-if="selectedCacheKey"
            expand="block"
            fill="outline"
            color="danger"
            class="file-tool-text-btn"
            :disabled="loading"
            aria-label="删除当前缓存"
            @click="$emit('deleteCurrentCache')"
          >
            <ion-icon slot="start" :icon="trashOutline" aria-hidden="true" />
            删除当前缓存
          </ion-button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { IonAlert, IonButton, IonIcon } from '@ionic/vue'
import {
  banOutline,
  closeOutline,
  handRightOutline,
  refreshOutline,
  trashOutline,
  volumeHighOutline,
  volumeMuteOutline,
} from 'ionicons/icons'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ScoreCacheSummary } from '@/lib/scoreCache'
import {
  extractMusicXmlPageLayout,
  OSMD_ORCHESTRAL_ONE_SYSTEM_LAYOUT_HINT,
  type OsmdOrchestralOneSystemLayoutInfo,
} from '@/lib/osmd'
import type { ScoreRenderEngine } from '@/stores/scoreUi'
const props = defineProps<{
  expanded: boolean
  loading: boolean
  /** 已有乐谱渲染且无错误时显示删除/刷新 */
  scoreReady: boolean
  filteredCachedFiles: ScoreCacheSummary[]
  selectedCacheKey: string
  renderEngine: ScoreRenderEngine
  osmdManualPageWidthTenths: number
  osmdManualPageHeightTenths: number
  /** 当前乐谱 XML，用于手动 tenths → mm 预览（无乐谱时传空字符串） */
  osmdScalingSourceXml: string
  /** 大编制一页一 system 自动页高优化（非 null 时展示说明） */
  osmdOrchestralOneSystemLayout: OsmdOrchestralOneSystemLayoutInfo | null
  verovioPageWidth: number
  verovioShowHeader: boolean
  verovioShowFooter: boolean
  scoreThemeMode: 'light' | 'dark'
  pageTurnSoundEnabled: boolean
  scrollPlaybackAutoFollowEnabled: boolean
  playbackReady: boolean
  playbackLoading: boolean
  playbackPlaying: boolean
  playbackSourceHint: string
  viewMode: 'page' | 'scroll'
}>()

const emit = defineEmits<{
  (e: 'cached-file-select', value: string): void
  (e: 'render-engine-select', value: string): void
  (e: 'update:osmdManualPageWidthTenths', value: number): void
  (e: 'update:osmdManualPageHeightTenths', value: number): void
  (e: 'update:verovioPageWidth', value: number): void
  (e: 'update:verovio-show-header', value: boolean): void
  (e: 'update:verovio-show-footer', value: boolean): void
  (e: 'toggle-score-theme-mode'): void
  (e: 'apply-osmd-layout'): void
  (e: 'apply-verovio-layout'): void
  (e: 'trigger-pick'): void
  (e: 'toggle-page-turn-sound'): void
  (e: 'toggle-scroll-playback-auto-follow'): void
  (e: 'prepare-orchestra-playback'): void
  (e: 'play-orchestra'): void
  (e: 'pause-orchestra'): void
  (e: 'stop-orchestra'): void
  (e: 'update:viewMode', value: 'page' | 'scroll'): void
  (e: 'deleteCurrentCache'): void
  (e: 'delete-cached-file', cacheKey: string): void
  (e: 'refreshPage'): void
}>()

const deleteItemConfirmOpen = ref(false)
const pendingDeleteItem = ref<ScoreCacheSummary | null>(null)

const deleteItemConfirmMessage = computed(() => {
  const name = pendingDeleteItem.value?.fileName?.trim()
  return name
    ? `确定删除「${name}」的本地缓存吗？删除后需重新打开该乐谱。`
    : '确定删除该文件的本地缓存吗？'
})

const deleteItemConfirmButtons = [
  { text: '取消', role: 'cancel' as const },
  {
    text: '确认删除',
    role: 'destructive' as const,
    handler: () => {
      const cacheKey = pendingDeleteItem.value?.cacheKey
      if (cacheKey) {
        emit('delete-cached-file', cacheKey)
      }
      pendingDeleteItem.value = null
    },
  },
]

function requestDeleteCachedFile(item: ScoreCacheSummary) {
  pendingDeleteItem.value = item
  deleteItemConfirmOpen.value = true
}

function onDeleteItemConfirmDismiss() {
  deleteItemConfirmOpen.value = false
  pendingDeleteItem.value = null
}

const scoreFilePageLayout = computed(() => {
  const xml = props.osmdScalingSourceXml.trim()
  if (!xml) return null
  return extractMusicXmlPageLayout(xml)
})

/** 手动高度明显小于乐谱默认时，OSMD 常无法在单页放下一个 system（管弦乐总谱尤甚）。 */
const osmdPageSizeWarn = computed(() => {
  const file = scoreFilePageLayout.value
  if (!file) return null
  const w = props.osmdManualPageWidthTenths
  const h = props.osmdManualPageHeightTenths
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  const heightPct = Math.round((h / file.heightTenths) * 100)
  const widthPct = Math.round((w / file.widthTenths) * 100)
  if (h >= file.heightTenths * 0.9 && w >= file.widthTenths * 0.9) return null
  const parts: string[] = []
  if (h < file.heightTenths * 0.9) {
    parts.push(
      `高度为默认的 ${heightPct}%（建议 ≥ ${file.heightTenths} tenths）`,
    )
  }
  if (w < file.widthTenths * 0.9) {
    parts.push(`宽度为默认的 ${widthPct}%（建议 ≥ ${file.widthTenths} tenths）`)
  }
  return `${parts.join('；')}。管弦乐总谱易出现「PageFormat too small / 无法放下一个 system」警告。`
})

const orchestralOneSystemHint = computed(() => {
  const layout = props.osmdOrchestralOneSystemLayout
  if (!layout?.applied) return null
  const file = scoreFilePageLayout.value
  if (!file) return OSMD_ORCHESTRAL_ONE_SYSTEM_LAYOUT_HINT
  return `${OSMD_ORCHESTRAL_ONE_SYSTEM_LAYOUT_HINT}（原高 ${file.heightTenths} tenths → 当前 ${layout.adjustedHeightTenths} tenths）`
})

function parseTenthsInput(ev: Event): number | null {
  const value = Number.parseFloat((ev.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : null
}

function onOsmdManualPageWidthTenthsChange(ev: Event) {
  const value = parseTenthsInput(ev)
  if (value === null) return
  emit('update:osmdManualPageWidthTenths', value)
}

function onOsmdManualPageHeightTenthsChange(ev: Event) {
  const value = parseTenthsInput(ev)
  if (value === null) return
  emit('update:osmdManualPageHeightTenths', value)
}

function onVerovioPageWidthChange(ev: Event) {
  const value = Number.parseInt((ev.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(value)) return
  emit('update:verovioPageWidth', Math.max(600, Math.min(10000, value)))
}

const prepareProgress = ref(0)
let prepareProgressTimer: number | null = null
let prepareDoneTimer: number | null = null

function clearPrepareTimers() {
  if (prepareProgressTimer !== null) {
    window.clearInterval(prepareProgressTimer)
    prepareProgressTimer = null
  }
  if (prepareDoneTimer !== null) {
    window.clearTimeout(prepareDoneTimer)
    prepareDoneTimer = null
  }
}

function resetPrepareProgressUi() {
  clearPrepareTimers()
  prepareProgress.value = 0
}

watch(
  () => props.playbackLoading,
  (loading) => {
    clearPrepareTimers()
    if (loading) {
      prepareProgress.value = Math.max(prepareProgress.value, 6)
      prepareProgressTimer = window.setInterval(() => {
        if (prepareProgress.value < 90) {
          prepareProgress.value += Math.max(1, Math.round((90 - prepareProgress.value) * 0.08))
        }
      }, 260)
      return
    }
    if (prepareProgress.value > 0) {
      prepareProgress.value = 100
      prepareDoneTimer = window.setTimeout(() => {
        prepareProgress.value = 0
      }, 700)
    }
  },
)

/** 切换缓存乐谱或换源后，交响乐区块回到未准备状态，清空本地准备进度。 */
watch(
  () => props.selectedCacheKey,
  () => {
    resetPrepareProgressUi()
  },
)

watch(
  () => props.playbackReady,
  (ready, wasReady) => {
    if (wasReady && !ready) {
      resetPrepareProgressUi()
    }
  },
)

onBeforeUnmount(() => {
  clearPrepareTimers()
})
</script>

<style lang="scss" scoped>
$file-side-panel-max-height: calc(
  100dvh - var(
    --annotation-panel-height-subtract,
    calc(var(--ion-safe-area-top, 0px) + 52px + var(--ion-safe-area-bottom, 0px) + 52px + 12px)
  )
);

.file-side-panel {
  position: fixed;
  top: calc(var(--ion-safe-area-top, 0px) + 52px);
  left: 10px;
  z-index: 30;
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  min-height: 0;
  max-height: $file-side-panel-max-height;
  overflow: hidden;
}

.file-side-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 208px;
  max-width: min(46vw, 280px);
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  max-height: $file-side-panel-max-height;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 16px 14px 50px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(4px);

  /* 避免在可滚动 flex 列里被压扁，改由 .file-side-body 整体滚动 */
  > * {
    flex-shrink: 0;
  }

  .cached-file-list,
  .engine-select {
    width: 100%;
    max-width: 100%;
  }

  .cached-file-list {
    margin: 0;
    padding: 4px;
    list-style: none;
    box-sizing: border-box;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    flex-shrink: 0;
    min-height: 42px;
    max-height: calc(42px * 3 + 8px);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;

    .cached-file-item {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 42px;
      flex-shrink: 0;
      border-radius: 6px;

      &--active {
        background: var(--color-primary-soft);
      }

      .cached-file-name-btn {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 36px;
        margin: 0;
        padding: 6px 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--color-text);
        font-size: 0.88rem;
        line-height: 1.25;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;

        &:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      }

      .cached-file-remove-btn {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--color-text-tertiary);
        cursor: pointer;

        ion-icon {
          font-size: 1.1rem;
        }

        &:hover:not(:disabled) {
          color: var(--color-danger);
          background: var(--color-danger-soft);
        }

        &:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      }
    }
  }

  .engine-select {
    height: 40px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0 12px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.86rem;
  }

  :deep(ion-button) {
    margin: 0;
    font-size: 0.95rem;
    min-height: 46px;
    --padding-top: 12px;
    --padding-bottom: 12px;
    --padding-start: 16px;
    --padding-end: 16px;
  }

  .open-score-btn {
    --color: var(--color-primary-contrast);
  }

  .view-mode-segment {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
    max-width: 100%;
    padding: 3px;
    border-radius: 10px;
    background: var(--color-border-light);

    .view-mode-btn {
      min-height: 42px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--color-text-secondary);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;

      &--active {
        background: var(--color-primary);
        color: var(--color-primary-contrast);
      }

      &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
    }
  }

  .verovio-layout-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 10px;
    background: var(--color-surface-muted);

    .verovio-layout-field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .verovio-layout-label {
      flex: 0 0 auto;
      min-width: 72px;
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      line-height: 1.3;
    }

    .verovio-layout-input {
      height: 34px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 0 10px;
      background: var(--color-surface);
      color: var(--color-text);
      font-size: 0.84rem;
      min-width: 104px;
    }

    .layout-option-check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.82rem;
      color: var(--color-text-secondary);
      line-height: 1.35;
    }

    .osmd-dim-hint {
      margin: 0;
      font-size: 0.78rem;
      line-height: 1.35;
      color: var(--color-text-secondary);
    }

    .osmd-dim-sub {
      margin: 0;
      font-size: 0.76rem;
      line-height: 1.35;
      color: var(--color-text-secondary);

      &--warn {
        color: var(--ion-color-warning-shade, #b45309);
      }

      &--info {
        color: var(--ion-color-primary-shade, #1d4ed8);
      }
    }

    .verovio-layout-input--readonly {
      background: rgba(0, 0, 0, 0.04);
      color: var(--color-text-secondary);
      cursor: default;
    }

    .score-theme-hint {
      margin: 0;
      font-size: 0.82rem;
      color: var(--color-text-secondary);
      line-height: 1.35;
    }

    .orchestra-playback-title {
      margin: 0;
      font-size: 0.84rem;
      color: var(--color-text);
      font-weight: 600;
    }
  }

  .orchestra-playback-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 10px;
    background: var(--color-surface-muted);

    .orchestra-playback-desc {
      margin: 0 0 8px;
      font-size: 0.78rem;
      line-height: 1.45;
      color: var(--color-text-secondary);
    }

    .orchestra-playback-title {
      margin: 0;
      font-size: 0.84rem;
      color: var(--color-text);
      font-weight: 600;
    }

    .orchestra-playback-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;

      :deep(ion-button) {
        min-height: 40px;
        font-size: 0.82rem;
      }
    }

    .prepare-progress-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: -2px;

      .prepare-progress-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.76rem;
        color: var(--color-text-secondary);
      }

      .prepare-progress-track {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        background: var(--color-playback-bg);
        overflow: hidden;

        .prepare-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #60a5fa 0%, var(--color-primary) 100%);
          transition: width 160ms ease;
        }
      }
    }

    .orchestra-source-hint {
      margin: 0;
      font-size: 0.76rem;
      color: var(--color-text-secondary);
    }
  }

  .file-tool-score-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    padding-top: 4px;
    margin-top: 2px;

    .file-tool-text-btn {
      :deep(ion-icon) {
        font-size: 1.35rem;
      }
    }
  }
}

.file-side-slide-enter-active,
.file-side-slide-leave-active {
  transition:
    transform 0.35s ease,
    opacity 0.35s ease;
}

.file-side-slide-enter-from,
.file-side-slide-leave-to {
  transform: translateX(-22px);
  opacity: 0;
}

.file-side-slide-enter-to,
.file-side-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}
</style>
