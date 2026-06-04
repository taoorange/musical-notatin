# 五线谱（Five Line Staff）

仓库目录为 **musical-notatin**；npm 包名与工程标识为 **five-line-staff**。这是一个基于 **Vue 3 + Ionic + Capacitor + PWA** 的乐谱工作台，支持本地 **MusicXML / MXL / MEI** 加载、**Verovio / OSMD** 双引擎渲染、谱面标注、语义播放与 **IndexedDB** 缓存恢复。

## 功能概览

| 能力 | 说明 |
|------|------|
| 文件格式 | `.musicxml`、`.mxl`（JSZip 解压）、`.mei`（Verovio） |
| 渲染引擎 | **OSMD**（默认，分页 SVG + 墨迹锚点）/ **Verovio**（WASM，高质量分页） |
| 视图模式 | 分页 / 滚动；双指缩放、拖拽（`ScorePinchViewport`） |
| 标注 | 文字、乐器图标快捷键；导出为 MusicXML `<direction id="fls-ann-*">`；第三方 `<direction>` 保留由 OSMD 排版 |
| 播放 | Verovio MIDI + FluidSynth 音色（远程 SF2/SF3，IndexedDB 音色缓存） |
| 持久化 | UI 偏好（`localStorage`）、谱面缓存（`five-line-staff-cache`）、最近打开列表 |
| 多端 | Web PWA（`vite-plugin-pwa`）、iOS/Android（Capacitor 8） |

## 快速开始

**环境**：Node.js 18+、npm 9+

```bash
npm install
npm run dev
```

浏览器访问 Vite 开发地址（默认 `http://localhost:5173`），使用「打开乐谱」导入 `.mxl` / `.musicxml` / `.mei` 即可。

使用说明页：`/instructions-for-use`

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发（端口 5173） |
| `npm run dev:test` | 测试模式 PWA 名称 |
| `npm run build` / `build:web` | `vue-tsc && vite build` |
| `npm run build:test` | 测试环境构建 |
| `npm run build:ios` | Web 构建 + `cap sync` |
| `npm run cap:sync` | 仅同步 Capacitor 资源 |
| `npm run cap:open:ios` / `cap:open:android` | 打开原生工程 |
| `npm run preview` | 预览构建产物 |
| `npm run test:unit` | Vitest（`tests/unit`） |
| `npm run test:e2e` | Cypress（需 `npm run cypress:install`） |
| `npm run lint` | ESLint `src` + `tests` |
| `npm run typecheck` | `vue-tsc --noEmit` |

## 技术栈

- **框架**：Vue 3（`<script setup lang="ts">`）、Vue Router、Pinia + `pinia-plugin-persistedstate`
- **UI / 壳**：`@ionic/vue`、`@ionic/vue-router`、Capacitor 8
- **乐谱**：`verovio`、`@taotao-lib/opensheetmusicdisplay`、`jszip`
- **播放**：`js-synthesizer` + 远程 SoundFont（构建时剔除 `dist` 内大体积本地 SF）
- **构建**：Vite 5、`@vitejs/plugin-legacy`、`vite-plugin-pwa`、Sass（modern API）
- **质量**：Vitest、Cypress（optional）、ESLint、Husky + lint-staged

## 项目结构

```text
musical-notatin/
├── src/
│   ├── main.ts                 # Ionic / Pinia / Router 入口
│   ├── App.vue
│   ├── router/index.ts         # /、/home、/instructions-for-use
│   ├── stores/scoreUi.ts       # 引擎、分页、标注、播放 UI（localStorage v3）
│   ├── lib/
│   │   ├── osmd.ts             # OSMD 分页渲染、墨迹 span
│   │   ├── verovio.ts          # Verovio 渲染、MIDI、播放边界
│   │   ├── mxl.ts              # MXL → MusicXML 文本
│   │   ├── scoreCache.ts       # IndexedDB 谱面缓存
│   │   ├── musicXmlAnnotations.ts   # 标注导出/剥离/解析
│   │   ├── musicXmlNoteAnchors.ts   # 小节锚点、导出插入位置
│   │   ├── instrumentAnnotations.ts # 乐器快捷键 ↔ 图标
│   │   ├── orchestraPlayer.ts       # 管弦乐播放
│   │   ├── soundfontCache.ts        # 音色 IndexedDB
│   │   └── …                   # 播放光标、语义播放、排版同步等
│   ├── components/
│   │   ├── ScorePinchViewport.vue
│   │   └── MusicScoreLoading.vue
│   └── views/
│       ├── home-page/
│       │   ├── HomePage.vue              # 加载、渲染、缓存、播放编排
│       │   └── components/
│       │       ├── FileToolPanel.vue
│       │       ├── AnnotationToolPanel.vue
│       │       ├── AppHeader.vue
│       │       └── PagePagerFooter.vue
│       └── instructions-for-use/
├── docs/                       # 专题说明（标注、MusicXML、iPad 等）
├── tests/unit | tests/e2e
├── vite.config.ts
├── capacitor.config.ts         # appId: com.fivelinestaff.app
└── package.json
```

架构为 **单核心页（HomePage）+ 工具组件 + lib 服务层**；文件 → 解析 → 渲染 → 缓存 → 恢复已形成闭环。

## 核心数据流

```text
打开文件 → 格式识别（mxl/mei/xml）→ 选定引擎渲染 SVG
    → 解析墨迹锚点（OSMD）/ timemap（Verovio）
    → 标注 overlay（增删改）→ putScoreCache（IndexedDB）
    → 导出：withEmbeddedAnnotations → 下载 MusicXML
    → 再次打开：strip fls-ann-* → overlay 按 fls:nx/ny 等恢复
```

### 标注与 MusicXML（摘要）

- **屏上**：`ScoreAnnotationRecord`（`scoreCache.ts`），坐标为页内归一化 `x/y`，并记录 `anchorMeasureListIndex0`、`anchorTickStart`、`anchorXmlPartIndex0` 等锚点字段。
- **导出**：在目标小节**和弦头音符之前**插入 `<direction id="fls-ann-{uuid}">`，内含标准 `<words>`（Palatino、5.9688、bold，与 Sibelius/MuseScore 互通），`xmlns:fls` 上写 `page` / `nx` / `ny` / `measureIndex0` 等元数据；非零小节内偏移写入 `<offset sound="no">`。
- **打开**：仅剥离 `id` 以 `fls-ann-` 开头的 direction，**无该 id** 的第三方 `<direction>` 仍由 OSMD 原生排版；本应用标注用 overlay 重绘。
- **文件头**：`<!-- five-line-staff-ui:{json} -->` 保存引擎与页宽等，便于导出后再打开时恢复排版参数。
- **实现入口**：`src/lib/musicXmlAnnotations.ts`（`withEmbeddedAnnotations`、`parseScoreAnnotationsFromMusicXml`、`stripAnnotationArtifacts`）。

更完整的差异与排错说明见：

- [docs/MusicXML-direction标注与OSMD差异说明.md](docs/MusicXML-direction标注与OSMD差异说明.md)
- [docs/标注导出位置错乱问题排查与修复.md](docs/标注导出位置错乱问题排查与修复.md)

### 缓存

| 项 | 值 |
|----|-----|
| IndexedDB | `five-line-staff-cache` / objectStore `scores` |
| 键 | `{engine}:{layoutVersion}:{fileSha256}` |
| 内容 | 分页 SVG、标注、净 MusicXML、MIDI/播放边界、OSMD 墨迹 span 等 |
| 淘汰 | 按 `lastAccessAt`，最多保留 3 条 |

音色缓存库名：`five-line-staff-soundfont-cache`。

## 代码片段

**Pinia 持久化 UI 偏好**（键 `five-line-staff:score-ui:v3`）：

```ts
export const useScoreUiStore = defineStore('score-ui', {
  state: () => ({
    viewMode: 'page' as 'page' | 'scroll',
    renderEngine: 'osmd' as 'verovio' | 'osmd',
    annotationMode: false,
  }),
  persist: { key: 'five-line-staff:score-ui:v3', storage: localStorage },
})
```

**标注导出 XML 结构（示意）**：

```xml
<direction id="fls-ann-…" xmlns:fls="http://five-line-staff.local/ns/annotation/1"
           fls:page="1" fls:nx="0.52" fls:ny="0.18" fls:measureIndex0="12">
  <direction-type>
    <words default-x="…" default-y="…" font-family="Palatino Linotype"
           font-size="5.9688" font-weight="bold">标注文字</words>
  </direction-type>
  <offset sound="no">0</offset><!-- 非零时写入 divisions -->
  <voice>1</voice>
  <staff>1</staff>
</direction>
```

若 XML 无法被浏览器 DOM 解析，导出会回退为文件末尾 `<!--[ANNOTATIONS:…]-->` 注释块。

## 文档目录

| 文档 | 主题 |
|------|------|
| [MusicXML-direction标注与OSMD差异说明.md](docs/MusicXML-direction标注与OSMD差异说明.md) | OSMD 与 overlay 标注的两条渲染链路 |
| [标注导出位置错乱问题排查与修复.md](docs/标注导出位置错乱问题排查与修复.md) | 锚点与导出错位排错 |
| [iPad应用开发指南.md](docs/iPad应用开发指南.md) | Capacitor / iPad 开发 |
| [准备音色库优化与性能测试.md](docs/准备音色库优化与性能测试.md) | SoundFont 与播放性能 |

## 开发与构建说明

- **PWA 名称**：生产 `五线谱`；`development` / `test` 模式带后缀（见 `vite.config.ts`）。
- **Verovio**：`optimizeDeps.exclude: ['verovio']`；Workbox 预缓存上限 12MB（WASM chunk）。
- **开发 HMR**：Ionic `IonRouterOutlet` 下对 `src/**/*.vue` 使用整页刷新，避免 scoped 样式错位。
- **原生**：`npm run build:ios` 后使用 `cap:open:ios` 在 Xcode 中继续签名与发布。

## 许可证

私有项目（`package.json` 中 `"private": true`）。
