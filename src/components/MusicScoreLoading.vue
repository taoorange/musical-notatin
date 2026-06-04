<template>
  <Teleport to="body">
    <!-- 不使用 Transition：进入时从 opacity 0 动画会与主线程长时间同步任务（如 OSMD 解析）冲突，导致遮罩数秒内看不见 -->
    <div
      v-if="visible"
      class="music-score-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="music-score-loading__backdrop" />
      <div class="music-score-loading__content">
        <div class="music-score-loading__notes" aria-hidden="true">
          <span
            v-for="(item, idx) in noteItems"
            :key="idx"
            class="music-score-loading__note"
            :class="[`music-score-loading__note--${item.variant}`, `music-score-loading__note--i${idx}`]"
            :style="{ animationDelay: `${idx * 0.16}s` }"
          >
            <svg
              class="music-score-loading__note-svg"
              viewBox="0 0 1024 1024"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path :d="item.path" fill="currentColor" />
            </svg>
          </span>
        </div>
        <p class="music-score-loading__text">{{ displayText }}</p>
        <div
          v-if="!fixedMessage && stageMessages.length > 1"
          class="music-score-loading__dots"
          aria-hidden="true"
        >
          <span
            v-for="i in stageMessages.length"
            :key="i"
            class="music-score-loading__dot"
            :class="{ 'music-score-loading__dot--active': i - 1 === activeStageIndex }"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

/** 与 src/components/musical-note/*.svg 中 path 一致，便于主题色与动效 */
const NOTE1_PATH =
  'M926.72 267.946667v49.92c0 41.813333-16.64 77.653333-46.08 98.56-18.346667 13.653333-40.96 20.053333-64.426667 20.053333-14.506667 0-29.013333-2.133333-43.946666-7.253333l-229.546667-76.373334V768c0 111.786667-90.88 202.666667-202.666667 202.666667S137.386667 879.786667 137.386667 768s90.88-202.666667 202.666666-202.666667c53.76 0 102.4 21.333333 138.666667 55.466667V170.666667c0-41.386667 17.066667-77.226667 46.506667-98.56 29.44-20.906667 68.693333-25.6 107.946666-12.8l188.586667 63.146666c58.026667 19.2 104.96 84.48 104.96 145.493334z'

const NOTE2_PATH =
  'M974.4 0L313.6 144s-49.6 11.2-49.6 48v651.2c-24-8-52.8-11.2-81.6-11.2C81.6 832 0 875.2 0 928s81.6 96 182.4 96 182.4-43.2 182.4-96V417.6l561.6-118.4v400c-24-6.4-52.8-11.2-83.2-11.2-100.8 0-182.4 43.2-182.4 96s81.6 96 182.4 96S1024 836.8 1024 784V48c0-27.2-22.4-48-49.6-48z'

const noteItems = [
  { variant: 'a' as const, path: NOTE1_PATH },
  { variant: 'b' as const, path: NOTE2_PATH },
  { variant: 'a' as const, path: NOTE1_PATH },
]

const props = withDefaults(
  defineProps<{
    visible: boolean
    /** 若设置则固定显示该文案，不轮换阶段 */
    message?: string
    /** 加载阶段文案，按序轮换；默认与 HomePage `loadScoreFromOpenedFile` 冷加载步骤一致，父组件可覆盖 */
    stageMessages?: string[]
    /** 阶段切换间隔（毫秒）；仅在未传入 `loadingStageIndex` 时用于自动轮换 */
    stageIntervalMs?: number
    /**
     * 当前阶段下标 0..n-1，由父组件在真实异步边界更新。
     * 打开大谱时主线程常被同步渲染长时间占用，`setInterval` 无法触发，故以受控阶段为准。
     * 不传或传 `null` 时退回 `stageIntervalMs` 定时轮换。
     */
    loadingStageIndex?: number | null
  }>(),
  {
    // 与 HomePage.vue `loadScoreFromOpenedFile` 流程对齐：读文件与哈希 → 缓存键与 IndexedDB → 标注解析与剥离 → 引擎渲染 → 对齐标注与写缓存
    stageMessages: () => [
      '正在读取乐谱文件并计算校验信息…',
      '正在匹配排版版本并查询本地渲染缓存…',
      '正在解析内嵌标注并准备渲染用乐谱…',
      '正在使用渲染引擎生成谱面页面…',
      '正在对齐标注位置并保存到本地缓存…',
    ],
    stageIntervalMs: 1000,
  },
)

const tickStageIndex = ref(0)
let stageTimer: ReturnType<typeof setInterval> | undefined

const fixedMessage = computed(() => props.message != null && props.message !== '')

/** 父组件受控；`null`/`undefined` 表示使用定时器递增 */
const isStageControlled = computed(
  () =>
    !fixedMessage.value &&
    props.loadingStageIndex != null &&
    Number.isFinite(Number(props.loadingStageIndex)),
)

const activeStageIndex = computed(() => {
  const list = props.stageMessages
  const len = list.length
  if (!len) return 0
  if (fixedMessage.value) return 0
  if (isStageControlled.value) {
    const i = Math.trunc(Number(props.loadingStageIndex))
    return Math.max(0, Math.min(i, len - 1))
  }
  return Math.min(tickStageIndex.value, len - 1)
})

const displayText = computed(() => {
  if (fixedMessage.value) return props.message as string
  const list = props.stageMessages
  if (!list.length) return ''
  return list[activeStageIndex.value] ?? ''
})

function syncStageTimer() {
  if (stageTimer) {
    clearInterval(stageTimer)
    stageTimer = undefined
  }
  if (!props.visible) {
    tickStageIndex.value = 0
    return
  }
  if (fixedMessage.value) {
    tickStageIndex.value = 0
    return
  }
  if (isStageControlled.value) {
    tickStageIndex.value = 0
    return
  }
  tickStageIndex.value = 0
  const len = props.stageMessages.length
  if (len <= 1) return
  stageTimer = setInterval(() => {
    tickStageIndex.value = (tickStageIndex.value + 1) % props.stageMessages.length
  }, props.stageIntervalMs)
}

watch(
  () =>
    [
      props.visible,
      fixedMessage.value,
      props.stageIntervalMs,
      props.stageMessages,
      props.loadingStageIndex,
      isStageControlled.value,
    ] as const,
  () => {
    syncStageTimer()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (stageTimer) clearInterval(stageTimer)
})
</script>

<style scoped>
.music-score-loading {
  position: fixed;
  inset: 0;
  z-index: 40000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.music-score-loading__backdrop {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    125deg,
    rgba(15, 23, 42, 0.38) 0%,
    rgba(30, 58, 138, 0.32) 45%,
    rgba(15, 23, 42, 0.42) 100%
  );
  backdrop-filter: blur(10px) saturate(1.35);
  -webkit-backdrop-filter: blur(10px) saturate(1.35);
  animation: music-loading-backdrop 3.2s ease-in-out infinite;
}

.music-score-loading__content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.75rem 2.25rem;
  max-width: min(92vw, 22rem);
  border-radius: 20px;
}

.music-score-loading__notes {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1.35rem;
  min-height: 52px;
}

.music-score-loading__note {
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  animation: music-note-bounce 1.05s ease-in-out infinite;
}

.music-score-loading__note--a {
  color: var(--ion-color-primary);
  filter: drop-shadow(0 2px 8px color-mix(in srgb, var(--ion-color-primary) 35%, transparent));
}

.music-score-loading__note--b {
  color: var(--ion-color-secondary);
  filter: drop-shadow(0 2px 8px color-mix(in srgb, var(--ion-color-secondary) 35%, transparent));
}

.music-score-loading__note--i1 {
  animation-duration: 1.15s;
}

.music-score-loading__note--i2 {
  animation-duration: 0.95s;
}

.music-score-loading__note-svg {
  display: block;
  width: 40px;
  height: 40px;
  animation: music-note-hue 2.8s ease-in-out infinite;
}

.music-score-loading__note--i1 .music-score-loading__note-svg {
  animation-delay: 0.35s;
}

.music-score-loading__note--i2 .music-score-loading__note-svg {
  animation-delay: 0.7s;
}

.music-score-loading__text {
  margin: 0;
  min-height: 1.35em;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ion-text-color);
  letter-spacing: 0.02em;
  line-height: 1.45;
}

.music-score-loading__dots {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  justify-content: center;
}

.music-score-loading__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ion-color-medium) 45%, transparent);
  transition:
    transform 0.25s ease,
    background 0.25s ease;
}

.music-score-loading__dot--active {
  transform: scale(1.25);
  background: var(--ion-color-primary);
}

@keyframes music-loading-backdrop {
  0%,
  100% {
    backdrop-filter: blur(10px) saturate(1.35);
    -webkit-backdrop-filter: blur(10px) saturate(1.35);
    opacity: 1;
  }
  50% {
    backdrop-filter: blur(18px) saturate(1.55);
    -webkit-backdrop-filter: blur(18px) saturate(1.55);
    opacity: 0.96;
  }
}

@keyframes music-note-bounce {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  40% {
    transform: translateY(-14px) scale(1.05);
  }
  55% {
    transform: translateY(0) scale(1);
  }
}

@keyframes music-note-hue {
  0%,
  100% {
    opacity: 1;
    filter: brightness(1);
  }
  50% {
    opacity: 0.88;
    filter: brightness(1.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .music-score-loading__backdrop {
    animation: none;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .music-score-loading__note {
    animation: none;
  }

  .music-score-loading__note-svg {
    animation: none;
  }
}
</style>
