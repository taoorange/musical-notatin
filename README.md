# five-line-staff

`five-line-staff` 是一个基于 `Vue 3 + Ionic + Capacitor + PWA` 的乐谱工作台项目，支持本地 `MusicXML / MXL / MEI` 文件加载、双引擎渲染（Verovio / OSMD）、标注编辑与本地缓存恢复。

## 1. 运行与打包方式

## 环境要求

- Node.js 18+
- npm 9+

## 安装依赖

```bash
npm install
```

## 本地开发

```bash
npm run dev
```

默认启动 Vite 开发服务（端口 `5173`）。

## Web 打包

```bash
npm run build:web
```

等价于：`vue-tsc && vite build`。

## 通用构建入口

```bash
npm run build
```

当前内部转发到 `build:web`。

## iOS/Capacitor 打包与同步

```bash
npm run build:ios
```

执行内容：`vue-tsc && vite build && npx cap sync`。

其他常用命令：

```bash
# 仅同步 Capacitor 资源
npm run cap:sync

# 打开原生工程
npm run cap:open:ios
npm run cap:open:android
```

## 预览、测试、Lint

```bash
# 打包产物本地预览
npm run preview

# 单元测试（Vitest）
npm run test:unit

# E2E 测试（Cypress）
npm run test:e2e

# 代码检查
npm run lint
```

---

## 2. 项目技术与关键代码 Demo

## 技术栈

- 前端框架：`Vue 3`（`<script setup lang="ts">`）
- UI/容器：`@ionic/vue`、`@ionic/vue-router`
- 原生壳：`Capacitor`（iOS/Android）
- 状态管理：`Pinia` + `pinia-plugin-persistedstate`
- 乐谱渲染：
  - `verovio`（WASM，支持 `.mei/.musicxml/.mxl`）
  - `@taotao-lib/opensheetmusicdisplay`（OSMD）
- 打包工具：`Vite 5` + `@vitejs/plugin-legacy`
- PWA：`vite-plugin-pwa`
- 测试：`Vitest` + `Cypress`
- 其他核心库：`jszip`（解析 MXL）

## 关键技术点 Demo

## Demo 1：Pinia 持久化 UI 偏好

适用于页面模式、渲染引擎、标注配置等用户偏好跨会话保存。

```ts
import { defineStore } from 'pinia'

export const useScoreUiStore = defineStore('score-ui', {
  state: () => ({
    viewMode: 'page' as 'page' | 'scroll',
    renderEngine: 'osmd' as 'verovio' | 'osmd',
    annotationMode: false,
  }),
  persist: {
    key: 'five-line-staff:score-ui:v2',
    storage: localStorage,
  },
})
```

## Demo 2：Verovio 布局参数应用（分页 + 主题色）

适用于高质量分页渲染、页面宽度控制、深浅色谱面墨色切换。

```ts
toolkit.setOptions({
  pageWidth,
  pageHeight,
  adjustPageWidth: false,
  adjustPageHeight: true,
  scale: 20,
  expand: true,
  header: 'auto',
  footer: 'none',
  svgCss: `
    g.score, g.note, g.rest {
      fill: ${inkColor};
      stroke: ${inkColor};
    }
  `,
})
```

## Demo 3：MXL 转 MusicXML 文本

适用于 `.mxl` 上传后统一进入渲染链路。

```ts
import JSZip from 'jszip'

export async function mxlToMusicXmlString(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const container = zip.file('META-INF/container.xml')
  // 从 container.xml 解析 rootfile.full-path，再读取对应 XML
  // 若缺失则回退到 zip 内 musicxml/xml 条目遍历
  // ...
  return xmlText
}
```

## Demo 4：IndexedDB 乐谱缓存写入

缓存页面 SVG、当前页、标注和导出源 XML，支持下次恢复。

```ts
await putScoreCache({
  cacheKey,
  fileName: file.name,
  pagesSvg: pages,
  totalPages: pages.length,
  viewMode: viewMode.value,
  currentPage: 1,
  annotations: annotations.value,
  musicXmlForExport: currentScoreXmlForExport.value,
  layoutVersion,
})
```

## Demo 5：标注嵌入导出（仅 MusicXML `<direction>`）

导出时在**首个 `<part>`** 内写入与 Sibelius / MuseScore 通用的结构：`<direction id="fls-ann-…">`（仅 `id` 为本应用保留，便于解析与渲染前剥离）→ `<direction-type><words default-x/y …>`（Palatino、5.9688、bold；黑色不写 `color`，其它颜色写入 `color`）→ 若非零则 **`<offset sound="no">` 小节内 divisions** → `<voice>` / `<staff>`。插入在锚点**和弦头音符之前**（与音乐学院参考一致）。打开乐谱时**只剥离** `fls-ann-*` 的 direction 并用 overlay 重绘；**无该 id** 的第三方 `<direction>`（如音乐学院导播）保留在 XML 中由 OSMD 原生排版。仍会解析**旧版**带 `fls:*` 的 `fls-ann` 导出、文件末尾注释及历史上的 `miscellaneous-field`。

若 XML 无法被浏览器 DOM 解析，则回退为仅追加 `<!--[ANNOTATIONS:…]-->` 注释。

实现见 `src/lib/musicXmlAnnotations.ts` 中的 `withEmbeddedAnnotations` / `parseScoreAnnotationsFromMusicXml` / `stripAnnotationArtifacts`。

---

## 3. 文件架构与职责说明

当前项目源码集中在 `src/`，核心业务围绕首页展开。

```text
five-line-staff
├─ src
│  ├─ main.ts                         # 应用入口：挂载 Ionic / Pinia / Router
│  ├─ App.vue                         # 根容器（IonApp + IonRouterOutlet）
│  ├─ router
│  │  └─ index.ts                     # 路由定义（当前仅 Home）
│  ├─ stores
│  │  └─ scoreUi.ts                   # UI 状态与持久化
│  ├─ lib
│  │  ├─ verovio.ts                   # Verovio 初始化与渲染工具
│  │  ├─ osmd.ts                      # OSMD 分页渲染封装
│  │  ├─ mxl.ts                       # MXL 解压转换
│  │  └─ scoreCache.ts                # IndexedDB 缓存层
│  ├─ components
│  │  ├─ ScorePinchViewport.vue       # 缩放/拖拽/标注交互视口
│  │  └─ MusicScoreLoading.vue        # 全屏加载层
│  └─ views
│     └─ home-page
│        ├─ HomePage.vue              # 核心页面（当前主业务集中）
│        └─ components
│           ├─ FileToolPanel.vue      # 文件/引擎/排版工具面板
│           ├─ AnnotationToolPanel.vue# 标注工具面板
│           └─ PagePagerFooter.vue    # 分页底栏
├─ tests
│  ├─ unit                            # Vitest 单元测试
│  └─ e2e                             # Cypress 端到端测试
├─ vite.config.ts                     # Vite + PWA + legacy 配置
├─ capacitor.config.ts                # Capacitor 工程配置
└─ package.json                       # 脚本与依赖
```

## 架构特点

- 当前是“**单核心页面 + 多辅助组件**”结构；
- `HomePage.vue` 承担文件加载、缓存恢复、渲染编排、交互管理等多职责；
- 已形成较完整的“文件 -> 解析 -> 渲染 -> 缓存 -> 恢复”闭环。

---

## 4. 后续优化建议（落地版）

以下建议来自当前代码和实际命令诊断（构建、lint、测试）：

## P0：先恢复工程基线（建议优先处理）

- 修复 `eslint` 当前报错（`prefer-const`）。
- 重写单元测试样例（现有测试仍是脚手架模板，且未注入 Pinia）。
- 建立最小回归测试集合：
  - 文件格式识别与导入流程；
  - 缓存恢复逻辑；
  - 标注导出（含注释块）逻辑。

## P1：拆分 HomePage 业务职责

建议把以下逻辑从 `HomePage.vue` 抽到 composables/services：

- `useScoreLoader`：文件读取、格式探测、引擎路由
- `useScoreCacheState`：缓存读写、列表刷新、恢复最近文件
- `useAnnotations`：标注增删改、嵌入导出
- `usePageGesture`：翻页手势、火花动效、沉浸式栏位联动

目标：降低核心页复杂度，提升可测试性和维护效率。

## P1：优化打包体积与分包策略

- 当前主包体积偏大（约 9.9MB），建议设置 `manualChunks`。
- 避免同模块“静态 + 动态”混用（`verovio.ts` 相关警告），让动态分包真正生效。
- 对重依赖（Verovio/OSMD）进行按需加载与懒加载路由/功能块拆分。

## P2：缓存策略升级

- 当前以“条目数”淘汰缓存，建议加入“体积阈值”策略（按总字节数控制）。
- 记录缓存读写耗时与失败原因（配额不足、序列化异常）用于排障。
- 针对超大谱面尝试更轻量缓存格式（例如仅缓存源 XML + 渲染参数，而非全部 SVG）。

## P2：交互与可维护性增强

- 增加统一错误码与用户提示分层（用户可读 vs 开发调试日志）。
- 为 iPad 手势、标注拖拽、缩放等关键交互增加 E2E 回归用例。
- 在 README 之外补充 `docs/architecture.md` 与 `docs/cache-strategy.md`，降低新成员理解成本。

---

## 快速开始（推荐）

```bash
npm install
npm run dev
```

打开浏览器访问本地地址后，使用“打开乐谱”导入 `.mxl/.musicxml/.mei` 即可开始使用。


---

## 5. 标注功能完整逻辑梳理

本章梳理当前基于 **OSMD 引擎**的标注功能实现逻辑，涵盖从打开文件、标注交互、锚点定位、MusicXML 导出到 IndexedDB 持久化的整套数据流。暂不涉及 Verovio 引擎。

### 5.1 核心数据模型

标注数据由 `ScoreAnnotationRecord` 类型定义（`src/lib/scoreCache.ts`），每条记录包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | UUID 唯一标识 |
| `page` | `number` | 标注所在谱面页码（1-based） |
| `x, y` | `number` | 在 SVG 谱面上的归一化坐标（0–1） |
| `text` | `string` | 标注文字内容 |
| `color` | `string` | 标注颜色 |
| `icon` | `string` | 乐器 SVG 图标数据 |
| `iconShortcut` | `string` | 快捷键字符串（如 `"V1"`、`"FL"`），导出后供本应用还原 SVG 图标 |
| `anchorElementId` | `string` | 点击命中的 SVG `xml:id`（调试用） |
| `anchorTickStart` | `number` | MIDI tick 时间锚点，用于在 MusicXML 中定位 `<direction>` 插入位置 |
| `anchorMeasureListIndex0` | `number` | OSMD 首声部小节列表的 0-based 索引，导出时优先用其锁定 `<direction>` 所在小节 |
| `_dbgBounds` | `string` | 调试字段：点击所在页的小节区间 `"start,end,inkSpanCount"` |

### 5.2 整体架构与关键文件

```
打开文件 → SVG 解析 → 标注面板 → 用户操作 → 锚点计算 → 标注导出 → 持久化
```

| 文件 | 职责 |
|------|------|
| `src/views/home-page/AnnotationToolPanel.vue` | 标注 UI：工具栏 + 侧边面板 + 谱面点击交互 |
| `src/lib/musicXmlAnnotations.ts` | 核心：MusicXML 标注解析/导出、内联标注处理 |
| `src/lib/musicXmlNoteAnchors.ts` | OSMD 小节→墨迹归一化坐标映射、锚点计算 |
| `src/lib/instrumentAnnotations.ts` | 乐器快捷键 ↔ SVG 图标映射（如 `V1` → 小提琴图标） |
| `src/lib/scoreCache.ts` | IndexedDB 持久化层：缓存读写、SHA-256 指纹 |

### 5.3 完整数据流

#### 阶段 1：打开文件 & SVG 解析

```
HomePage.vue 接收文件
  └── OSMD 引擎渲染 SVG
       └── parseOsmdScore(svgString, annotations)
            ├── 将 SVG 转为 DOM，分割为多页 pagesSvg[]
            ├── 提取每个 <g class="page"> 作为一页谱面
            └── parseInlineAnnotations() 从 SVG 内联注释恢复旧标注
```

1. **文件打开**：`HomePage.vue` 接收 `.musicxml/.mxl/.mei` 文件 → 调用 `osmdEngine.render()` 渲染 SVG
2. **SVG 解析**（`musicXmlAnnotations.ts`）：
   - 将 SVG 字符串转为 DOM → 按 `<g class="page">` 分割为多页数组
   - 同步解析内联标注（从 `five-line-staff-ui` 注释恢复已导出的标注）
3. **墨迹锚点计算**（`musicXmlNoteAnchors.ts`）：
   - 调用 `normalizeOsmdMeasureSpanListForPage()` 解析首声部 `<measure>` 元素
   - 提取每个小节的 SVG `@inkStartX`、`@inkEndX`、`@page` 属性
   - 计算归一化墨迹区间 `left/right`，建立 **页码 → 小节墨迹区间** 映射表
   - 保存 `osmdPageMeasureInkNormSpans` 到缓存

#### 阶段 2：标注 UI 交互（AnnotationToolPanel.vue）

标注面板分为三个部分：

**① 顶部工具栏（`#annotation-toolbar`）**：
```
[快速工具: 演奏记号 | 演奏技巧 | 表情术语 | 乐器]  → 下拉面板
[标准工具: 文字标注 | 图标标注 | 擦除]
```
- 每个下拉面板展示对应图标网格 + 快捷键标签（如 "V1-小提琴1"、"FL-长笛"）
- 点击图标即进入对应标注模式

**② 右侧面板（`#annotation-panel`）**：
- **文字标注模式**：输入文字 → 设置颜色 → 在谱面上点击放置
- **图标标注模式**：选择乐器图标 → 在谱面上点击放置
- **擦除模式**：在谱面上点击已存在的标注进行删除

**③ 谱面点击（`#score-svg`）**：
```
点击事件处理流程:
1. 计算归一化坐标 (mouseX, mouseY) = 像素坐标 / SVG 尺寸
2. 擦除模式: 遍历 annotations 列表，找最近的标注点 → 删除
3. 文字/图标模式: 创建新标注记录
   - 生成 UUID
   - 记录 page、x、y、text、color
   - 如果是乐器图标，从 shortcuts 查找 iconShortcut
4. 调用 store.addAnnotation() 更新状态
5. 触发 saveCurrentScoreToCache() 写入 IndexedDB
```

#### 阶段 3：点击时的锚点计算（核心逻辑 — 三遍查找策略）

当用户在谱面上点击时（`handleSvgClick`），执行三遍查找以精确锚定 `<direction>` 应插入的小节：

```
第一遍：精确查找（墨迹范围内）
  1. 根据 page 找到 osmdPageMeasureInkNormSpans[page]
  2. 遍历墨迹区间，找 left ≤ mouseX ≤ right 的小节
  3. 若有命中 → 使用 anchorMeasureListIndex0 = 小节 index
                   anchorTickStart = 该小节起始 tick

第二遍：近似查找（SVG DOM 元素命中）
  1. document.elementFromPoint(mouseX * width, mouseY * height)
  2. 检查返回元素的 svgId 是否以 "mXX_Y" 开头（小节 ID 模式）
  3. 若有命中 → 从 svgId 解析出 measureIndex

第三遍：tick 时间定位（回退路径）
  1. 从 cache.musicXmlForExport 解析 divisionsPerMeasure
  2. 根据 mouseX / page / 谱面比例估算 tick 值
  3. 找到 tick 最近的小节
```

锚点数据 (`anchorMeasureListIndex0`、`anchorTickStart`) 保存在标注记录中，用于导出时精确插入。

#### 阶段 4：标注导出（`exportAnnotationsToMusicXml`）

导出是将标注写入 MusicXML 文件的关键环节：

```
导出流程:
1. 获取原始 MusicXML 文本 (cache.musicXmlForExport)
2. 清理旧标注:
   a. 移除 five-line-staff-ui 文件头注释
   b. 移除旧 <sound> 标签 (tempo/metronome)
   c. 移除所有 <direction> 类型的标注
   d. 移除 miscellaneous 类型的标注
   e. 移除 scoreAnnotation 注释
   f. 移除 type="annotation" 的 <direction-type>
3. 按时间排序标注:
   - 有 anchorTickStart → 按 tick 排序
   - 有 anchorMeasureListIndex0 → 按 measureListIndex 排序
   - 都没有 → 按 page + x 坐标排序
4. 逐个插入标注:
   - 优先用 anchorMeasureListIndex0 定位目标小节
   - 其次用 anchorTickStart 在 divisionsPerMeasure 中估算
   - 最后按 mouseX 比例回退估算
   - 在目标小节的第一个 <note> 之后插入 <direction> 元素
5. 生成 MusicXML 字符串
6. 触发浏览器下载文件
7. 保存清理后的 MusicXML 到 cache.musicXmlForExport
```

**标注 XML 结构**（写入 MusicXML `<direction>` 元素）：

```xml
<!-- 文字标注 -->
<direction>
  <direction-type>
    <five-line-staff-ui type="annotation" color="red" shortcut="">
      <text>标注文字</text>
    </five-line-staff-ui>
  </direction-type>
  <five-line-staff-ui type="annotation" page="1" x="0.5" y="0.3"
                     elementId="m3_0" measureIndex0="2"
                     tickStart="5760" color="red" shortcut="" text="标注文字"/>
</direction>

<!-- 乐器标注（带图标） -->
<direction>
  <direction-type>
    <five-line-staff-ui type="instrument-icon" color="#333333" shortcut="FL">
      <text>长笛</text>
      <icon width="16" height="20">...SVG...</icon>
    </five-line-staff-ui>
  </direction-type>
  <five-line-staff-ui type="instrument-icon" page="1" x="0.5" y="0.3"
                     elementId="m3_0" measureIndex0="2"
                     tickStart="5760" color="#333333" shortcut="FL" text="长笛"/>
</direction>
```

**命名空间**：`<five-line-staff-ui>` 使用自定义命名空间
`xmlns:fls="https://five-line-staff.app/custom-namespace"`

#### 阶段 5：持久化存储

通过 `scoreCache.ts` 将数据存入 IndexedDB：

| 项目 | 值 |
|------|------|
| 数据库名 | `five-line-staff-cache` |
| 存储名 | `scores`（keyPath = `cacheKey`） |
| 缓存键格式 | `{engine}:{layoutVersion}:{fileSha256}` |
| 触发写入时机 | 每次标注增删改后自动 `saveCurrentScoreToCache()` |
| 恢复方式 | 从缓存读取 `annotations` 数组并在谱面上 overlay 渲染 |
| 淘汰策略 | 按 `lastAccessAt` 排序，最多保留 3 条 |

**缓存写入前的序列化**：IndexedDB 无法持久化 Vue Proxy，写入前转为结构化克隆兼容的纯对象，包括数值规范化、图标字段条件过滤等。

### 5.4 OSMD 引擎的关键角色

OSMD 引擎在整个标注流程中提供：

1. **SVG 渲染**：将 MusicXML 渲染为可交互的 SVG 谱面
2. **SVG 结构约定**：
   - 每页一个 `<g class="page">`
   - 每小节一个 `<g>`，`@inkStartX`/`@inkEndX` 标注墨迹边界
   - 小节 ID 格式：`mXX_Y`（如 `m3_0` = 第 3 页第 0 个小节）
3. **墨迹锚点数据**：`osmdPageMeasureInkNormSpans` 存储每页小节的墨迹归一化区间 `left/right`，用于点击时的精确定位
4. **首声部小节列表**：`osmdPageMeasureIndexBounds` 存储每页在首声部小节数组中的索引范围

### 5.5 数据流总图

```
打开文件
  └── OSMD 渲染 SVG
       └── parseOsmdScore() → pagesSvg[] + 墨迹锚点
            └── save to IndexedDB

用户操作
  └── AnnotationToolPanel.vue
       ├── 选择标注模式（文字 / 图标 / 擦除）
       └── 点击谱面放置标注
            └── 三遍锚点查找 → 计算 measureIndex / tick
                 └── store.addAnnotation()
                      └── saveCurrentScoreToCache() → IndexedDB

导出
  └── exportAnnotationsToMusicXml()
       ├── 清理旧标注 XML
       ├── 按时间排序
       ├── 在 <note> 后插入 <direction>
       │    └── <direction> 内含 <five-line-staff-ui> 自定义元素
       └── 浏览器下载 + 保存 musicXmlForExport

下次打开
  └── IndexedDB 恢复
       └── parseInlineAnnotations() 从 SVG 注释恢复标注 UI
```

### 5.6 设计要点总结

- **标注作为 MusicXML 的 `<direction>` 元素持久化**：标准 XML 结构保证第三方乐谱软件（MuseScore / Sibelius）可打开文件而不崩溃
- **自定义 `five-line-staff-ui` 命名空间**：在 `<direction>` 中存储应用特有数据（坐标、颜色、图标），与标准 MusicXML 元素共存
- **墨迹锚点 + tick 时间双重定位**：通过 OSMD 解析的墨迹区间与 MIDI tick 建立标注与谱面的精确关联，解决重新排版后标注错位问题
- **IndexedDB 作为持久化层**：缓存页面 SVG、标注数组、导出源 XML，支持秒级恢复
