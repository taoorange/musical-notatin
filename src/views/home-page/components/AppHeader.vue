<template>
  <ion-header
    :translucent="true"
    class="header-container"
    :class="{
      'score-chrome-hidden score-chrome-hidden--header': !scoreChromeVisible && canToggleScoreChrome,
      'header-container--dark': effectiveScoreThemeMode === 'dark',
    }"
  >
    <ion-toolbar class="header-main-toolbar">
      <div slot="start" class="header-left">
        <ion-button
          fill="clear"
          size="small"
          class="header-file-tool-toggle"
          :disabled="loading"
          :aria-label="fileToolPanelExpanded ? '收起文件工具' : '打开文件工具'"
          @click="$emit('toggle-file-tool')"
        >
          <img
            class="header-file-tool-toggle-icon"
            :src="fileToolPanelExpanded ? foldUpSvgUrl : expandSvgUrl"
            alt=""
            width="22"
            height="22"
          />
        </ion-button>
        <ion-button
          fill="clear"
          size="small"
          class="header-instructions-entry"
          aria-label="进入使用说明"
          @click="$emit('open-instructions')"
        >
          使用说明
        </ion-button>
      </div>
      <div class="header-center">
        <span v-if="fileName && pagesSvgLength && !error" class="header-doc-title">{{ fileName }}</span>
      </div>
      <div slot="end" class="header-right">
        <ion-button
          fill="clear"
          size="small"
          class="header-refresh-page"
          :disabled="loading"
          aria-label="刷新页面"
          @click="$emit('refresh-page')"
        >
          <ion-icon :icon="refreshOutline" aria-hidden="true" />
        </ion-button>
        <ion-button
          v-if="pagesSvgLength > 0"
          fill="clear"
          size="small"
          class="header-playback-toggle"
          :disabled="loading || orchestraPlaybackLoading || !orchestraPlaybackReady"
          :aria-label="orchestraPlaying ? '暂停播放' : '开始播放'"
          @click="togglePlayback"
        >
          <ion-icon :icon="orchestraPlaying ? pauseOutline : playOutline" />
        </ion-button>
        <ion-button
          v-if="pagesSvgLength > 0"
          fill="clear"
          size="small"
          class="header-export-annotated-musicxml"
          :disabled="loading || !canExportAnnotatedMusicXml"
          aria-label="导出带标注 MusicXML"
          @click="$emit('export-annotated-musicxml')"
        >
          <ion-icon :icon="downloadOutline" />
        </ion-button>
        <ion-button
          v-if="pagesSvgLength > 0"
          fill="clear"
          size="small"
          class="header-annotation-tool-toggle"
          :disabled="loading"
          :aria-label="annotationPanelExpanded ? '收起标注工具' : '打开标注工具'"
          @click="$emit('toggle-annotation')"
        >
          <SignIcon
            class="header-annotation-tool-toggle-icon"
            :class="{ 'header-annotation-tool-toggle-icon--active': annotationMode }"
          />
        </ion-button>
       
      </div>
    </ion-toolbar>
    <!-- 错误提示 -->
    <ion-toolbar v-if="!loading && error" class="header-meta-toolbar">
      <div class="header-meta-inner">
        <ion-text v-if="error" color="danger">
          <p class="header-meta-text header-meta-error">{{ error }}</p>
        </ion-text>
      </div>
    </ion-toolbar>
  </ion-header>
</template>

<script setup lang="ts">
import { IonButton, IonHeader, IonIcon, IonText, IonToolbar } from '@ionic/vue'
import { downloadOutline, pauseOutline, playOutline, refreshOutline } from 'ionicons/icons'
import { onBeforeUnmount, onMounted } from 'vue'
import expandSvgUrl from '@/assets/svg/expand.svg'
import foldUpSvgUrl from '@/assets/svg/fold-up.svg'
import SignIcon from '@/components/icons/SignIcon.vue'

const props = defineProps<{
  scoreChromeVisible: boolean
  canToggleScoreChrome: boolean
  effectiveScoreThemeMode: 'light' | 'dark'
  fileToolPanelExpanded: boolean
  loading: boolean
  fileName: string
  pagesSvgLength: number
  error: string
  orchestraPlaybackLoading: boolean
  orchestraPlaybackReady: boolean
  orchestraPlaying: boolean
  canExportAnnotatedMusicXml: boolean
  annotationPanelExpanded: boolean
  annotationMode: boolean
}>()

const emit = defineEmits<{
  'toggle-file-tool': []
  'open-instructions': []
  'toggle-playback': []
  'export-annotated-musicxml': []
  'toggle-annotation': []
  'refresh-page': []
}>()

function canTogglePlayback(): boolean {
  return (
    props.pagesSvgLength > 0 &&
    !props.loading &&
    !props.orchestraPlaybackLoading &&
    props.orchestraPlaybackReady
  )
}

function togglePlayback() {
  if (!canTogglePlayback()) return
  emit('toggle-playback')
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return !!target.closest('ion-input, ion-textarea, [contenteditable="true"]')
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest('button, a[href], ion-button, [role="button"]')
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key !== ' ' && ev.code !== 'Space') return
  if (ev.repeat) return
  if (isEditableTarget(ev.target) || isInteractiveTarget(ev.target)) return
  if (!canTogglePlayback()) return
  ev.preventDefault()
  togglePlayback()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style lang="scss" scoped>
.header-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
  background-color: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  transition: transform 220ms ease, opacity 220ms ease;

  .header-main-toolbar {
    --min-height: 42px;
    --padding-start: 8px;
    --padding-end: 8px;

    .header-left {
      display: flex;
      align-items: center;
      gap: 6px;

      :deep(ion-button) {
        --padding-start: 8px;
        --padding-end: 8px;
        --border-radius: 6px;
        font-size: 0.78rem;
        margin: 0;
      }

      .header-instructions-entry {
        --padding-start: 10px;
        --padding-end: 10px;
        --border-radius: 999px;
        --background: var(--color-primary-soft);
        --color: var(--color-primary);
        font-weight: 600;
      }

      .header-file-tool-toggle {
        margin: 0;
        --padding-start: 6px;
        --padding-end: 6px;
        --border-radius: 8px;
        --background: transparent;
        --box-shadow: none;

        .header-file-tool-toggle-icon {
          display: block;
          width: 22px;
          height: 22px;
          object-fit: contain;
          pointer-events: none;
        }
      }
    }

    .header-center {
      flex: 1;
      display: flex;
      justify-content: center;
      padding-inline: 8px;

      .header-doc-title {
        font-size: 0.82rem;
        color: var(--color-text);
        text-align: center;
        max-width: min(56vw, 320px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;

      :deep(ion-button) {
        --padding-start: 8px;
        --padding-end: 8px;
        --border-radius: 8px;
        margin: 0;

        ion-icon {
          font-size: 26px;
          width: 26px;
          height: 26px;
        }
      }

      .header-annotation-tool-toggle {
        --padding-start: 8px;
        --padding-end: 8px;
        --background: transparent;
        --box-shadow: none;

        .header-annotation-tool-toggle-icon {
          display: block;
          width: 26px;
          height: 26px;
          pointer-events: none;
          color: var(--color-text);

          &.header-annotation-tool-toggle-icon--active {
            color: var(--color-primary);
          }
        }
      }

      .header-page-total {
        font-size: 0.78rem;
        color: var(--color-text-tertiary);
        white-space: nowrap;
      }
    }
  }

  .header-meta-toolbar {
    --min-height: auto;
    --padding-top: 2px;
    --padding-bottom: 4px;

    .header-meta-inner {
      width: 100%;
      padding-inline: 4px;

      .header-meta-text {
        margin: 0;
        font-size: 0.74rem;
        line-height: 1.3;
        text-align: center;
        word-break: break-word;

        &.header-meta-error {
          margin: 0;
        }
      }

      .header-meta-hint {
        color: var(--color-text-secondary);

        strong {
          font-weight: 600;
        }
      }
    }
  }
}
.header-container--dark {
  background-color: var(--color-bg-dark);
  border-bottom-color: var(--color-border-dark);

  .header-main-toolbar {
    :deep(ion-button) {
      --color: var(--color-text-dark);
    }

    .header-center {
      .header-doc-title {
        color: var(--color-text-dark);
      }
    }

    .header-left {
      .header-instructions-entry {
        --background: rgba(96, 165, 250, 0.22);
        --color: var(--color-text-dark);
      }

      .header-file-tool-toggle {
        .header-file-tool-toggle-icon {
          filter: brightness(0) invert(1);
        }
      }
    }

    .header-right {
      .header-annotation-tool-toggle {
        .header-annotation-tool-toggle-icon {
          color: var(--color-text-dark);

          &.header-annotation-tool-toggle-icon--active {
            color: var(--color-primary);
          }
        }
      }

      .header-page-total {
        color: var(--color-text-secondary-dark);
      }
    }
  }
}
</style>
