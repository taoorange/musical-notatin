<template>
  <ion-footer class="score-pager-footer">
    <ion-toolbar class="pager-toolbar">
      <div class="pager-row">
        <ion-button fill="clear" :disabled="currentPage <= 1" aria-label="上一页" @click="prev">
          <ion-icon :icon="chevronBackOutline" />
        </ion-button>

        <div class="pager-center">
          <span class="pager-label">第</span>
          <ion-input
            class="pager-input"
            type="number"
            inputmode="numeric"
            :min="1"
            :max="totalPages"
            :value="pageDraft"
            aria-label="页码"
            @ionInput="onPageDraftInput"
            @ionBlur="$emit('commit-page-jump')"
            @keyup.enter="$emit('commit-page-jump')"
          />
          <span class="pager-total">/ {{ totalPages }} 页</span>
        </div>

        <ion-button fill="clear" :disabled="currentPage >= totalPages" aria-label="下一页" @click="next">
          <ion-icon :icon="chevronForwardOutline" />
        </ion-button>
      </div>
    </ion-toolbar>
  </ion-footer>
</template>

<script setup lang="ts">
import { IonButton, IonFooter, IonIcon, IonInput, IonToolbar } from '@ionic/vue'
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons'
import { onBeforeUnmount, onMounted } from 'vue'

const props = defineProps<{
  currentPage: number
  totalPages: number
  pageDraft: string
}>()

const emit = defineEmits<{
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'update:page-draft', value: string): void
  (e: 'commit-page-jump'): void
}>()

function prev() {
  if (props.currentPage <= 1) return
  emit('prev')
}

function next() {
  if (props.currentPage >= props.totalPages) return
  emit('next')
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return !!target.closest('ion-input, ion-textarea, [contenteditable="true"]')
}

function onKeydown(ev: KeyboardEvent) {
  if (isEditableTarget(ev.target)) return
  if (ev.key === 'ArrowLeft') {
    ev.preventDefault()
    prev()
  } else if (ev.key === 'ArrowRight') {
    ev.preventDefault()
    next()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onPageDraftInput(ev: Event) {
  const v = (ev as CustomEvent<{ value?: string | null }>).detail?.value
  emit('update:page-draft', v == null ? '' : String(v))
}
</script>

<style scoped>
.score-pager-footer {
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
}

.pager-toolbar {
  --min-height: 42px;
  --padding-top: 2px;
  --padding-bottom: 2px;
  --padding-start: 6px;
  --padding-end: 6px;
}

.pager-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 4px;
}

.pager-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}

.pager-label,
.pager-total {
  font-size: 0.84rem;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.pager-row :deep(ion-button) {
  margin: 0;
  height: 36px;
  --padding-start: 2px;
  --padding-end: 2px;
}

.pager-row :deep(ion-button ion-icon) {
  font-size: 1.35rem;
}

.pager-input {
  width: 52px;
  max-width: 68px;
  min-height: 32px;
  text-align: center;
  font-size: 0.84rem;
  --padding-start: 4px;
  --padding-end: 4px;
}

.pager-input :deep(.native-input) {
  text-align: center;
}
</style>
