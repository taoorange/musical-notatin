<template>
  <div v-if="visible" class="annotation-side-panel" :class="{ 'annotation-side-panel--expanded': expanded }">
    <transition name="annotation-side-slide">
      <div v-if="expanded" class="annotation-side-body">
        <section class="annotation-section">
          <h3 class="annotation-section-title">标注模式</h3>
          <div class="annotation-mode-actions">
            <ion-button
              :fill="annotationMode ? 'solid' : 'outline'"
              :disabled="loading"
              @click="$emit('toggle-annotation-mode')"
            >
              {{ annotationMode ? '退出标注' : '进入标注' }}
            </ion-button>
            <ion-button
              class="annotation-mode-btn"
              :fill="annotationsVisible ? 'outline' : 'solid'"
              :disabled="loading || (!annotationsCount && annotationsVisible)"
              @click="$emit('toggle-annotations-visible')"
            >
              {{ annotationsVisible ? '隐藏标注' : '显示标注' }}
            </ion-button>
          </div>
        </section>

        <section class="annotation-section annotation-section--shortcuts">
          <h3 class="annotation-section-title">快捷符号</h3>
          <label class="annotation-field">
            <span class="annotation-field-label">标注文字</span>
            <input
              :value="annotationDraftText"
              class="annotation-text-input"
              type="text"
              maxlength="24"
              placeholder="输入或点击下方符号"
              :disabled="loading || !canAnnotateInFileFormat"
              @input="$emit('update:annotation-draft-text', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <div class="annotation-shortcut-icons">
            <button
              v-for="item in annotationShortcutButtons"
              :key="`shortcut-icon-${item.value}`"
              type="button"
              class="annotation-shortcut-icon-btn"
              :class="{ 'annotation-shortcut-icon-btn--active': item.value === selectedAnnotationShortcut }"
              :disabled="loading || !canAnnotateInFileFormat"
              :title="`填入 ${item.value}`"
              @click="
                $emit('update:annotation-draft-text', item.value);
                $emit('update:selected-annotation-shortcut', item.value)
              "
            >
              <span class="annotation-shortcut-icon-wrap" aria-hidden="true">
                <component :is="item.iconComponent" v-if="item.iconComponent" class="annotation-shortcut-icon" />
              </span>
              <span class="shortcut-name">{{ item.name }}</span>
            </button>
          </div>
        </section>

        <section class="annotation-section">
          <h3 class="annotation-section-title">标注颜色</h3>
          <div class="annotation-color-swatches" role="radiogroup" aria-label="标注颜色">
            <button
              v-for="option in colorOptions"
              :key="option.value"
              type="button"
              class="annotation-color-swatch"
              :class="{ 'annotation-color-swatch--active': option.value === annotationColor }"
              role="radio"
              :aria-checked="option.value === annotationColor"
              :aria-label="option.label"
              :disabled="loading || !canAnnotateInFileFormat"
              @click="$emit('update:annotation-color', option.value)"
            >
              <span class="annotation-color-dot" :style="{ backgroundColor: option.value }" />
              <span class="annotation-color-label">{{ option.label }}</span>
            </button>
          </div>
        </section>

        <section class="annotation-section annotation-section--actions">
          <ion-button
            class="annotation-clear-btn"
            fill="outline"
            color="danger"
            expand="block"
            :disabled="loading || !annotationsCount"
            @click="$emit('clear-annotations')"
          >
            {{ isScrollView ? '清空全部标注' : '清空本页标注' }}
          </ion-button>
          <ion-button
            class="annotation-export-btn"
            expand="block"
            :disabled="loading || !canExportAnnotatedMusicXml"
            @click="$emit('export-annotated-musicxml')"
          >
            导出带标注 MusicXML
          </ion-button>
        </section>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonButton } from '@ionic/vue'
import {
  annotationShortcuts,
  getInstrumentAnnotationIconComponent,
  isInstrumentAnnotationShortcut,
} from '@/lib/instrumentAnnotations'

const props = defineProps<{
  visible: boolean
  expanded: boolean
  loading: boolean
  annotationMode: boolean
  annotationsVisible: boolean
  annotationsCount: number
  annotationDraftText: string
  annotationColor: string
  selectedAnnotationShortcut: string
  canAnnotateInFileFormat: boolean
  canExportAnnotatedMusicXml: boolean
  isScrollView: boolean
}>()

const colorOptions = [
  { value: '#ff0000', label: '红' },
  { value: '#0000ff', label: '蓝' },
  { value: '#00aa00', label: '绿' },
  { value: '#ff8800', label: '橙' },
  { value: '#8800ff', label: '紫' },
  { value: '#000000', label: '黑' },
] as const

const baseShortcutButtons = annotationShortcuts.map((item) => ({
  ...item,
  iconComponent: getInstrumentAnnotationIconComponent(item.value),
}))

const annotationShortcutButtons = computed(() => {
  const draft = props.annotationDraftText.trim()
  if (!draft || !isInstrumentAnnotationShortcut(draft)) return baseShortcutButtons
  if (annotationShortcuts.some((item) => item.value === draft)) return baseShortcutButtons

  return [
    {
      value: draft,
      name: draft,
      iconComponent: getInstrumentAnnotationIconComponent(draft),
    },
    ...baseShortcutButtons,
  ]
})

defineEmits<{
  (e: 'toggle-annotation-mode'): void
  (e: 'toggle-annotations-visible'): void
  (e: 'update:annotation-draft-text', value: string): void
  (e: 'update:annotation-color', value: string): void
  (e: 'update:selected-annotation-shortcut', value: string): void
  (e: 'clear-annotations'): void
  (e: 'export-annotated-musicxml'): void
}>()
</script>

<style lang="scss" scoped>
$annotation-panel-max-height: calc(
  100dvh - var(
    --annotation-panel-height-subtract,
    calc(var(--ion-safe-area-top, 0px) + 52px + var(--ion-safe-area-bottom, 0px) + 52px + 12px)
  )
);

.annotation-side-panel {
  position: fixed;
  top: calc(var(--ion-safe-area-top, 0px) + 52px);
  right: 10px;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  flex-direction: column;
}

.annotation-side-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 320px;
  max-width: min(64vw, 360px);
  min-height: 0;
  max-height: $annotation-panel-max-height;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 14px 14px 18px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid var(--color-border);
  box-shadow:
    0 4px 6px rgba(15, 23, 42, 0.04),
    0 12px 28px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(8px);

  scrollbar-width: thin;
  scrollbar-color: var(--color-text-tertiary) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-text-tertiary);
  }

  :deep(ion-button) {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    min-height: 44px;
    --border-radius: 10px;
    --padding-top: 11px;
    --padding-bottom: 11px;
    --padding-start: 14px;
    --padding-end: 14px;
  }

  .annotation-export-btn {
    --color: var(--color-primary-contrast);
  }
}

.annotation-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-light);
  background: var(--color-surface-muted);

  &--shortcuts {
    gap: 8px;
  }

  &--actions {
    gap: 8px;
    padding-top: 10px;
    background: transparent;
    border-color: transparent;
    padding-left: 0;
    padding-right: 0;
  }
}

.annotation-section-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text);
  text-transform: none;
}

.annotation-mode-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.annotation-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.annotation-field-label {
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.annotation-text-input {
  display: block;
  width: 100%;
  min-width: 0;
  height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.88rem;
  line-height: 1.2;
  box-sizing: border-box;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &::placeholder {
    color: var(--color-text-tertiary);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary-tint, #3b82f6);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: var(--color-surface-muted);
  }
}

.annotation-shortcut-icons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.annotation-shortcut-icon-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 64px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  padding: 8px 6px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;

  &:hover:not(:disabled):not(.annotation-shortcut-icon-btn--active) {
    border-color: #cbd5e1;
    background: var(--color-surface-muted);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--active {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.2);
  }
}

.annotation-shortcut-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.9);
}

.annotation-shortcut-icon-btn--active .annotation-shortcut-icon-wrap {
  background: rgba(255, 255, 255, 0.85);
}

.annotation-shortcut-icon-btn :deep(.instrument-icon-base),
.annotation-shortcut-icon {
  width: 22px;
  height: 22px;
}

.shortcut-name {
  width: 100%;
  min-width: 0;
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--color-text);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.annotation-color-swatches {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.annotation-color-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 52px;
  padding: 8px 4px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;

  &:hover:not(:disabled):not(.annotation-color-swatch--active) {
    border-color: #cbd5e1;
    background: var(--color-surface-muted);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--active {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.2);
  }
}

.annotation-color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    inset 0 0 0 1px rgba(15, 23, 42, 0.12),
    0 1px 2px rgba(15, 23, 42, 0.12);
}

.annotation-color-label {
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.annotation-color-swatch--active .annotation-color-label {
  color: var(--color-primary);
}

.annotation-side-slide-enter-active,
.annotation-side-slide-leave-active {
  transition:
    transform 0.35s ease,
    opacity 0.35s ease;
}

.annotation-side-slide-enter-from,
.annotation-side-slide-leave-to {
  transform: translateX(22px);
  opacity: 0;
}

.annotation-side-slide-enter-to,
.annotation-side-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}
</style>
