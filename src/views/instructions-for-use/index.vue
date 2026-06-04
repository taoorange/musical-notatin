<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar class="instructions-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" class="back-home-btn" aria-label="返回主页面" @click="backToHome">
            <ion-icon :icon="arrowBackOutline" />
            <span>返回</span>
          </ion-button>
        </ion-buttons>
        <ion-title>使用说明</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="instructions-content">
      <section class="hero">
        <div class="hero__pattern" aria-hidden="true" />
        <div class="hero__glow hero__glow--left" aria-hidden="true" />
        <div class="hero__glow hero__glow--right" aria-hidden="true" />
        <div class="hero__inner">
          <span class="hero-kicker">入门指南</span>
          <h1 class="hero-title">五线谱标注功能快速上手</h1>
          <p class="hero-subtitle">
            按照下方步骤即可完成导入、标注与播放，避免常见操作顺序错误。
          </p>
        </div>
      </section>

      <div class="content-body">
        <section class="steps-section">
          <h2 class="section-heading">快速开始</h2>

          <div class="steps-grid">
            <article class="step-card">
              <div class="step-card__head">
                <div class="step-index">01</div>
              </div>
              <h3>导入乐谱文件</h3>
              <div class="step-card__body">
                <p>点击左上角文件工具按钮，进入文件工具面板。</p>
                <p>选择「导入文件」并加载 MusicXML / MXL 等支持格式，成功后会显示乐谱页面。</p>
              </div>
            </article>

            <article class="step-card step-card--important">
              <div class="step-card__head">
                <div class="step-index">02</div>
                <span class="important-tag">重要</span>
              </div>
              <h3>开启标注功能</h3>
              <div class="step-card__body">
                <p>1、点击右上角按钮，弹出标记工具集。</p>
                <p>
                  2、在工具集内，必须再点击「进入标注」按钮，才可以开始在谱面上添加标记。
                </p>
                <p>
                  3、在工具集内，点击「退出标注」按钮，可以退出标注状态，防止页面误触。
                </p>
                <p>
                  4、若要删除标注数据，也需要先进入标注状态，再在谱面上<span class="gesture-highlight">长按</span>目标标注，或使用鼠标
                  <span class="gesture-highlight">左键双击</span>目标标注进行删除。
                </p>
              </div>
            </article>

            <article class="step-card step-card--important">
              <div class="step-card__head">
                <div class="step-index">03</div>
                <span class="important-tag">重要</span>
              </div>
              <h3>准备播放音色库</h3>
              <div class="step-card__body">
                <p>播放前请先在工具面板中加载音色库（sf3文件）。</p>
                <p>音色库加载完成后，再点击播放按钮，否则播放不可用或无声音。</p>
              </div>
            </article>
          </div>
        </section>

        <section class="features-section">
          <h2 class="section-heading">功能说明</h2>

          <div class="feature-panels-row">
            <article class="feature-panel">
              <h3>核心功能</h3>
              <ul>
                <li>文件管理：导入、切换与缓存乐谱文件。</li>
                <li>双模式浏览：支持翻页模式与滚动模式阅读乐谱。</li>
                <li>标注系统：在谱面添加、移动、删除标注，提升排练效率。</li>
                <li>乐谱播放：基于音色库进行回放，支持播放/暂停/停止操作。</li>
              </ul>
            </article>

            <article class="feature-panel">
              <h3>iPad 缩放支持</h3>
              <ul>
                <li>在 iPad 上支持双指捏合缩放乐谱，可放大查看细节或缩小查看全局。</li>
                <li>缩放后可拖动画面浏览不同区域，适合排练时快速定位小节内容。</li>
                <li>建议先停止播放后再进行大幅缩放，以获得更稳定的操作体验。</li>
              </ul>
            </article>
          </div>

          <article class="feature-panel">
            <h3>页面宽度与显示设置</h3>
            <ul>
              <li>可在设置中调整乐谱页面宽度，适配不同屏幕尺寸与阅读习惯。</li>
              <li>页面宽度调大后，乐谱会更适合横屏浏览；调小后则更适合查看整体结构。</li>
              <li>切换翻页模式或滚动模式时，页面宽度设置依然生效，可配合缩放一起使用。</li>
              <li>如果画面显示偏大或偏小，可以先调整页面宽度，再结合缩放功能微调。</li>
            </ul>
          </article>
        </section>

        <section class="tips-panel">
          <div class="tips-panel__icon" aria-hidden="true">!</div>
          <div class="tips-panel__content">
            <h3>操作小提示</h3>
            <p>如果出现乐谱渲染加载错误，请删除缓存后重新加载。</p>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
defineOptions({ name: 'InstructionsForUsePage' })

import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { arrowBackOutline } from 'ionicons/icons'
import { useIonRouter } from '@ionic/vue'

const ionRouter = useIonRouter()

const blurActiveElement = () => {
  const active = document.activeElement
  if (active instanceof HTMLElement) {
    active.blur()
  }
}

const backToHome = () => {
  blurActiveElement()
  if (ionRouter.canGoBack()) {
    ionRouter.back()
    return
  }
  ionRouter.navigate('/home', 'back', 'replace')
}
</script>

<style scoped>
.instructions-toolbar {
  --background: rgba(255, 255, 255, 0.88);
  --border-color: rgba(217, 227, 255, 0.8);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.back-home-btn {
  --padding-start: 6px;
  --padding-end: 10px;
  --color: #3d59d1;
  font-size: 14px;
  font-weight: 600;
}

.back-home-btn span {
  margin-left: 2px;
}

.instructions-content {
  --background: linear-gradient(180deg, #f7f9ff 0%, #eef3ff 45%, #f8fbff 100%);
}

.hero {
  position: relative;
  overflow: hidden;
  width: 100%;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: linear-gradient(125deg, #3a52c4 0%, #4d6ae8 46%, #6884ff 100%);
  color: #fff;
  box-shadow: 0 10px 28px rgba(65, 88, 208, 0.22);
}

.hero__pattern {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    180deg,
    transparent 0,
    transparent 17px,
    rgba(255, 255, 255, 0.07) 17px,
    rgba(255, 255, 255, 0.07) 18px
  );
  mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.55) 35%, rgba(0, 0, 0, 0.25) 100%);
  pointer-events: none;
}

.hero__glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.hero__glow--left {
  bottom: -72px;
  left: -48px;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, transparent 72%);
}

.hero__glow--right {
  top: -56px;
  right: -36px;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, transparent 70%);
}

.hero__inner {
  position: relative;
  z-index: 1;
  padding: 26px 20px 30px;
}

.hero-kicker {
  display: inline-flex;
  align-items: center;
  margin-bottom: 12px;
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.hero-title {
  margin: 0 0 12px;
  font-size: clamp(24px, 5.2vw, 32px);
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: -0.01em;
  text-shadow: 0 2px 12px rgba(26, 42, 120, 0.18);
}

.hero-subtitle {
  margin: 0;
  max-width: 34em;
  padding: 10px 0 0 14px;
  border-left: 3px solid rgba(255, 255, 255, 0.42);
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.92);
}

.content-body {
  width: 100%;
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.section-heading {
  margin: 0 0 12px;
  padding-left: 10px;
  border-left: 4px solid #5b7dff;
  color: #1a2550;
  font-size: 17px;
  font-weight: 700;
}

.steps-section {
  margin-bottom: 18px;
}

.steps-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  width: 100%;
}

.step-card {
  width: 100%;
  box-sizing: border-box;
  padding: 18px 16px;
  border: 1px solid #d9e3ff;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(80, 110, 196, 0.08);
}

.step-card--important {
  border-color: #fed7aa;
  background: linear-gradient(180deg, #fff 0%, #fffaf5 100%);
}

.step-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: #e8eeff;
  color: #2f4fda;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.step-card--important .step-index {
  background: #ffedd5;
  color: #c2410c;
}

.important-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 11px;
  font-weight: 700;
}

.step-card h3 {
  margin: 0 0 8px;
  color: #1e2a52;
  font-size: 19px;
  font-weight: 700;
}

.step-card__body p {
  margin: 0 0 6px;
  color: #4a5578;
  font-size: 14px;
  line-height: 1.65;
}

.step-card__body p:last-child {
  margin-bottom: 0;
}

.gesture-highlight {
  display: inline-block;
  padding: 0 6px;
  border-radius: 999px;
  background: #eef2ff;
  color: #2f4fda;
  font-weight: 700;
}

.features-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin-bottom: 12px;
}

.feature-panels-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  width: 100%;
}

.feature-panel {
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid #d9e3ff;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(80, 110, 196, 0.08);
}

.feature-panel h3 {
  margin: 0 0 10px;
  color: #1d2850;
  font-size: 18px;
  font-weight: 700;
}

.feature-panel ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.feature-panel li {
  position: relative;
  margin-bottom: 8px;
  padding-left: 16px;
  color: #46547d;
  font-size: 14px;
  line-height: 1.6;
}

.feature-panel li::before {
  content: '';
  position: absolute;
  top: 0.58em;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #5b7dff;
  transform: translateY(-50%);
}

.feature-panel li:last-child {
  margin-bottom: 0;
}

.tips-panel {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid #fde68a;
  border-radius: 14px;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  box-shadow: 0 8px 18px rgba(245, 158, 11, 0.1);
}

.tips-panel__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #f59e0b;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
}

.tips-panel__content h3 {
  margin: 0 0 6px;
  color: #92400e;
  font-size: 16px;
  font-weight: 700;
}

.tips-panel__content p {
  margin: 0;
  color: #78350f;
  font-size: 14px;
  line-height: 1.6;
}

@media (min-width: 768px) {
  .content-body {
    padding-inline: 20px;
  }

  .hero__inner {
    padding: 32px 20px 36px;
  }

  .hero-title {
    margin-bottom: 14px;
  }

  .steps-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .step-card:nth-child(3) {
    grid-column: span 2;
  }

  .feature-panels-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
}

@media (min-width: 1024px) {
  .content-body {
    padding-inline: 24px;
  }

  .hero__inner {
    padding: 36px 24px 40px;
  }

  .hero-subtitle {
    font-size: 15px;
  }

  .steps-grid {
    gap: 16px;
  }

  .features-section,
  .feature-panels-row {
    gap: 16px;
  }
}
</style>
