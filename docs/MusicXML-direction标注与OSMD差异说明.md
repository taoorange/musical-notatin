# MusicXML `<direction>` 标注：OSMD 与本项目差异说明

本文说明 **为何 OSMD（`taotao-lib-opensheetmusicdisplay`）解析第三方 `<direction><words>` 往往观感正确**，而 **本项目对自导出 `fls-ann-*` 标注再导入时可能出现误差**；并整理当前工程中 **与 `<direction>` 相关的实现逻辑**（导出、剥离、解析、锚点小节选择）。

---

## 1. 两条完全不同的渲染链路

| 维度 | OSMD 中的第三方标注（无 `fls-ann-*`） | 本应用自导出标注（`id="fls-ann-*"`） |
|------|----------------------------------------|----------------------------------------|
| XML 是否保留 | 保留在送入 OSMD 的 MusicXML 中 | 渲染前由 `stripAnnotationArtifacts` **移除**对应 `<direction>` |
| 谁画字 | OSMD 按谱面几何 + 时间轴排版后画进 **SVG** | 由 Vue 层 **HTML overlay**（`ScorePinchViewport`）按归一化 `page/x/y` 画在谱页上 |
| 位置依据 | 见下文「OSMD 如何摆字」 | 见下文「本项目如何摆字」 |

因此：**「OSMD 对」≠「本应用 overlay 用同一套规则」**。第三方 cue 从未被剥离，与 MuseScore 一样走 **谱内排版**；本应用 cue 被剥离后只能靠 **二次推算** 对齐视口，误差来源不同。

---

## 2. OSMD 为何常把「导播类」文字摆在合适位置

工程内 OSMD 源码路径：`taotao-lib-opensheetmusicdisplay/`（与上游 OpenSheetMusicDisplay 同类结构）。

### 2.1 读谱

- `InstrumentReader` 遍历小节子节点，遇到 `<direction>` 交给 `ExpressionReader`。
- `<direction-type><words>` 在 `ExpressionReader.interpretWords` 中处理；普通说明性文字多落成 **`UnknownExpression`**，挂到当前小节的 `MultiExpression` 上。

### 2.2 摆字（与 `default-x` / `default-y` 的非一一对应）

对 **`UnknownExpression`**，布局主要在 `MusicSheetCalculator.calculateMoodAndUnknownExpression`：

1. **水平 X**：通过 `getRelativePositionInStaffLineFromTimestamp`，在**已排版的 staff entry（音符等）**之间按 **音乐时间戳** 插值得到横坐标，而不是把 MusicXML 的 `default-x`（tenths）直接当作最终像素位置。
2. **垂直 Y**：`calculateLabel` 在 `placement === Above` 时，用 **`SkyBottomLineCalculator.getSkyLineMinInRange`** 在水平区间上取「天空线」——在**躲开符头、连线等**后的上方空隙里放字，属于 **防碰撞排版**。
3. **`default-y` 的特例**：仅当规则 `PlaceWordsInsideStafflineFromXml` 开启，且 `default-y` 为**负**并落在约 `(-50, 0)` 时，才会用 XML 的 `default-y` 去微调相对高度。参考谱里常见的 **正数、谱线上方** cue，往往**不走**这条分支，最终竖直位置主要由 **skyline** 决定。

因此：Sibelius 等软件写的 `default-x="13" default-y="61"` 与视觉一致时，OSMD 看起来「对」，是因为 **时间戳 + 小节内几何 + skyline** 与谱面一致；**不是**简单按「tenths → 整页百分比」在画。

---

## 3. 本项目为何会出现误差

### 3.1 双坐标系

- **Overlay**：`x/y` 为 **当前渲染页** 上的归一化坐标（约 `0~1`），`page` 为渲染页码。
- **MusicXML**：`default-x` / `default-y` 为 **小节 / staff 参照系下的 tenths**，与「整页 bbox」不是同一空间。

导出、再解析必须在两者之间做映射；任何一步近似都会带来偏差。

### 3.2 剥离 OSMD 原生 direction 后只靠反推

`fls-ann-*` 的 `<direction>` 会从渲染用 XML 中删掉，避免与 overlay **重复绘制**。代价是：OSMD **不再**为该条标注做 skyline 排版，位置完全依赖 **`parseScoreAnnotationsFromMusicXml` → overlay** 的推算。

### 3.3 锚点小节选错（历史问题与修复思路）

导出 `withEmbeddedAnnotations` 时，若 **`anchorTickStart` 无效或缺失**，会用 `pickTimedNoteForViewportPlacement(ann, timeline, measures, totalPages)` 根据 `page + x` 估一个小节内的锚点音符。

- **旧 bug**：曾使用 `globalT = (p - 1 + nx) / totalPages` 再乘全曲小节数 `M`。在 **第 1 页** 时 `globalT = nx / totalPages`，整页横向只对应全曲最前 `M/totalPages` 个小节，与「当前画布上从左到右的小节」不一致，易把标注写到**错误小节**（例如屏上已是印刷小节号 11，XML 却落在 measure 10），进而 `default-x/y` 相对错锚点音符计算，在 MuseScore 中也会显得「不对」。
- **当前实现**：按 **渲染总页** `totalPages` 将 `M` 个小节切成当前页的连续区间 `[floor((p-1)M/tp), floor(pM/tp)-1]`，再在该区间内用 `nx` 插值；与 overlay 的 `ann.page` 对齐。详见 `musicXmlNoteAnchors.ts` 中注释。

仍建议：在能拿到 Verovio 命中时尽量写入 **`anchorTickStart`**，优先走 `pickTimedNoteForAnchorTick`，对跨页、不均分小节更稳。

**OSMD 引擎**：原先仅在 Verovio 下通过 `getTimeForElement` 写入 `anchorTickStart`，OSMD 下该字段一直为空，导出只能纯靠视口估小节，易与「点击所见」不一致。现于添加/拖拽标注时，用与导出相同的 `pickTimedNoteForViewportPlacement` + 首声部时间轴写入 **`estimateAnchorTickFromViewportOnScoreXml`**（见 `musicXmlNoteAnchors.ts` / `HomePage.vue`），使 OSMD 下导出也能走 `pickTimedNoteForAnchorTick`。

### 3.4 竖直 `default-y` 与参考谱量级

早期导出曾把 `default-y` 顶到 **118** 等，与「音乐学院」参考里导播类字常见的 **约 59–76** 量级不一致，MuseScore 按 tenths 解释会错位。当前导出使用带上下限的线性式，使休止锚点、常见 `ann.y` 下 `default-y` 落在参考常见带内（实现见 `buildWordsDefaultXYForExport`）。

### 3.5 `ann.x` 与「小节左缘」的语义差异

`ann.x` 是 **整页宽度** 上的归一化位置。小节在页面上偏右时，即使用户主观在「小节开头」点字，`ann.x` 仍可能偏大；导出公式会按 `noteDx + (ann.x - 0.5) * spanX` 生成较大的 `default-x`，与 Sibelius 写在休止左侧附近的 **13** 等数值可能差一截。这是 **坐标语义不同**，不是 XML 解析随机错误。

---

## 4. 本项目 `<direction>` 相关逻辑（实现清单）

以下文件路径均相对于仓库根目录 `five-line-staff/`。

### 4.1 核心模块

| 能力 | 入口 / 函数 | 文件 |
|------|----------------|------|
| 嵌入导出 | `withEmbeddedAnnotations` | `src/lib/musicXmlAnnotations.ts` |
| 渲染前剥离 | `stripAnnotationArtifacts` | 同上 |
| 从文件恢复标注 | `parseScoreAnnotationsFromMusicXml` → `tryParseFromFlsDirections` | 同上 |
| 首声部时间轴与选锚点 | `buildFirstPartNoteTimeline`、`pickTimedNoteForAnchorTick`、`pickTimedNoteForViewportPlacement`、`spreadTimedNotePickForExport` 等 | `src/lib/musicXmlNoteAnchors.ts` |
| 调用剥离后的 XML 渲染 | `xmlForRender = stripAnnotationArtifacts(...)` | `src/views/home-page/HomePage.vue` |
| Overlay 绘制 | `annotationStyle`：`left: x*100%`、`top: y*100%` | `src/components/ScorePinchViewport.vue` |

### 4.2 标识与剥离规则

- 本应用写入的 `<direction>` 使用 **`id` 前缀 `fls-ann-`**（常量 `FLS_ANNOTATION_DIRECTION_ID_PREFIX`）。
- **`stripAnnotationArtifacts`**：删除所有 `id` 以 `fls-ann-` 开头的 `<direction>`；**不**删除无此前缀的第三方 `<direction>`，以便 OSMD 继续按原生逻辑绘制。
- 同时清理：旧版文件末尾注释块、旧 `miscellaneous-field`（`five-line-staff-annotations`）、已无 `fls:*` 属性时的根上 `xmlns:fls` 声明（`pruneUnusedFlsNamespaceFromRoot`）。

### 4.3 导出流程（`withEmbeddedAnnotations`）

对每个 `ScoreAnnotationRecord`：

1. **选锚点音符 `picked`**
   - 若存在有效 `anchorTickStart` 且时间轴非空：`pickTimedNoteForAnchorTick`。
   - 否则：`pickTimedNoteForViewportPlacement(ann, timeline, measures, totalPages)`（见 3.3）。
   - 再经 **`spreadTimedNotePickForExport`**：若多条标注定到同一和弦头，沿时间轴顺延到下一个未占用的和弦头，避免都挤在同一插入点。
2. **`directionOffsetDivisions`**：有 `picked` 时用 `picked.divisionsFromMeasureStart`；否则用「当前页映射小节」的 `getMeasureEndDivisions` 作为兜底。
3. **`measureForWords` / `anchorForWords`**：与插入目标一致；`anchorForWords` 为 `chordHeadNote(picked.note)` 或该页映射小节内第一颗和弦头。
4. **`buildWordsDefaultXYForExport(ann, anchorForWords, measureForWords)`**
   - `default-x`：`spanX = clamp(36, 90, round(mw*0.2))`，`defaultX = clamp(6, mw-6, round(noteDx + (ann.x - 0.5) * spanX))`。
   - `default-y`：`extraLift = max(0, -14 - noteDy) * 2.5`（低音符头略抬高），再 `noteDy + 75 + extraLift + (0.2 - ann.y) * 42`，并夹在 **52–78**，与参考谱导播类字常见范围对齐。
5. **`buildFlsDirectionElement`**：生成标准子元素 `<direction-type><words …/></direction-type>`，可选 `<offset sound="no">`（非 0 时），`voice`/`staff`；黑色不写 `color`，非黑写 `#RRGGBB`。
6. **`insertFlsDirectionForAnnotation`**：若有 `picked` 且父节点为小节，则 **`measure.insertBefore(dir, head)`**（`head = chordHeadNote(picked.note)`），与 Sibelius 常见顺序一致；否则把小节追加到「页映射」得到的小节末尾。

### 4.4 解析流程（`tryParseFromFlsDirections`）

仅处理 **`id` 以 `fls-ann-` 开头** 的 `<direction>`；其它 `<direction>` 忽略（由 OSMD 画）。

对每个匹配项：

- **若存在** `fls:*`（或命名空间）下的 **`page` + `nx` + `ny`**：直接使用（旧版无损视口，仍兼容）。
- **否则**：
  - **优先**：若存在 `<words>` 且 **`getFollowingAnchorNote(dir)`** 非空（与导出 `insertBefore` 语义一致），用 **`inferNormXYByInvertingExportWords`**，与 `buildWordsDefaultXYForExport` **同一套** `noteDx/noteDy/spanX/extraLift/常数` 反解 `ann.x/ann.y`。
  - **否则**：`inferNormXYFromMusicXmlDirectionContext`（按小节宽度与前后音符 `default-x` 插值；`words default-x` 大于锚点时可把右界扩到 `measure@width`，避免 t>1 贴页边）。
  - **再否则**：`wordsElementToNormXY` 兜底。
- **页码**：优先 `fls:page`；否则 `printedPageIndexForPartMeasure`；若满足「总页数>1 且 XML 从未出现 new-page」等条件则用按小节均分的 slice 回退；最后按 `totalPages` 夹紧（注意：`parseScoreAnnotationsFromMusicXml` 默认 **`totalPages` 常为 1**，除非调用方传入真实页数）。

### 4.5 解析优先级（`parseScoreAnnotationsFromMusicXml`）

顺序为：XML 解析失败则尝试旧注释 → **`<!--[ANNOTATIONS:...]-->`** → **`miscellaneous-field`**（旧 JSON）→ **`tryParseFromFlsDirections`**。

---

## 5. 可选后续方向（不在本文实现范围内）

- 渲染完成后用 **真实页数** 再调一次 `parseScoreAnnotationsFromMusicXml({ totalPages })`，减轻页码夹紧问题。
- 尽量保证 **`anchorTickStart`（及必要时 `anchorElementId`）** 在添加标注时写入，减少纯视口映射。
- 若需与 OSMD **像素级**一致：考虑从 OSMD 生成的 label 边界读回位置，或不再剥离 `fls-ann` 并接受与 overlay 的协调策略（避免双绘）。

---

## 6. 能否用 `taotao-lib-opensheetmusicdisplay` 计算「标注 / 再导入」位置？

**结论：可以，但前提是谱面旁要有一个与屏幕上的 SVG **同源、未销毁** 的 `OpenSheetMusicDisplay` 实例**；并把 OSMD 的**音乐时间（`Fraction`）**与工程里 **`buildFirstPartNoteTimeline` 的 tick**做统一标尺映射。当前 `src/lib/osmd.ts` 在 `renderMusicXmlWithOsmdPages` 里 **`load` → `render` → 抽 HTML → `host.remove()`**，**没有保留** `OpenSheetMusicDisplay` 引用，因此 **无法在点击或解析阶段调用 OSMD 内部几何 API**。

### 6.1 OSMD 侧与「点击 → 音符」直接相关的 API（源码在 `taotao-lib-opensheetmusicdisplay/`）

| 能力 | 位置 | 说明 |
|------|------|------|
| 谱面几何总线 | `OpenSheetMusicDisplay.GraphicSheet` → `GraphicalMusicSheet` | `OpenSheetMusicDisplay.ts` 公开 getter `GraphicSheet` |
| 屏幕 DOM → SVG 坐标 | `GraphicalMusicSheet.domToSvg(point)` | 内部用当前页 SVG 的 `getScreenCTM()` / `inverse` |
| SVG → DOM | `svgToDom` | 逆变换 |
| 最近音符 | `GetNearestNote(clickPosition: PointF2D, maxClickDist: PointF2D)` | 先 `GetNearestVoiceEntry`，再在 chord 里选最近 `GraphicalNote` |
| 音乐时间 | `GraphicalNote.sourceNote`（`Note`）→ `getAbsoluteTimestamp(): Fraction` | `Note.ts`：小节绝对时间 + voiceEntry 内偏移 |
| 最近文字 Label | `GetClickableLabel(clickPosition)` | `GraphicalMusicSheet.ts`，用于点选已绘制的 `GraphicalLabel` |

**添加标注时**若保留 OSMD 实例：对当前页容器上的 `clientX/clientY` 先换算到 **相对该页 SVG 的坐标**，再 `domToSvg` → `GetNearestNote` → 用 `getAbsoluteTimestamp()` 映射到与 `pickTimedNoteForAnchorTick` 一致的 **tick**（需在工程内实现 `Fraction ↔ divisions tick` 的换算，与 `buildFirstPartNoteTimeline` 同源）。

### 6.2 「再导入」时用 OSMD 反算 overlay 位置

两条路：

1. **不剥离 `fls-ann`**：由 OSMD 画字，本应用不画 overlay（需产品层解决与编辑态的双绘/可点选问题）。
2. **剥离后反推**：在**同一份** MusicXML 上再 `load` + `render` 一次（可离屏 `div`），遍历 `MusicSheet` / `GraphicalMusicSheet` 里与 `UnknownExpression` 对应的 **`GraphicalUnknownExpression`**（`StaffLine.AbstractExpressions`），读 `GraphicalLabel.PositionAndShape` 的绝对/相对坐标，再换算到本应用 `page/x/y`。成本：**二次排版**，且须与当前分页、缩放、宽度与首屏一致，否则仍有偏差。

### 6.3 与本项目现状的衔接建议（实现层级）

| 步骤 | 建议 |
|------|------|
| 1 | OSMD 模式下**不要**在仅导出 SVG 字符串后丢弃实例：在 `HomePage`（或专用 store）持有 `OpenSheetMusicDisplay` 引用，与 `pagesSvg` 同源更新；或把 `renderMusicXmlWithOsmdPages` 改为返回 `{ htmlPages, osmd }` 由上层管理生命周期。 |
| 2 | 点击标注：`domToSvg` + `GetNearestNote` → `Fraction` → **tick** → 写入 `anchorTickStart`（可逐步替代纯视口 `estimateAnchorTickFromViewportOnScoreXml`）。 |
| 3 | 再导入：优先仍用 **XML + `inferNormXYByInvertingExportWords`**；若要与 OSMD 像素一致，再引入 **离屏 OSMD 读 `GraphicalUnknownExpression` bbox** 作为可选路径。 |

公开 npm 包入口主要为 **`OpenSheetMusicDisplay`**（`@taotao-lib/opensheetmusicdisplay`）；`GraphicalMusicSheet` 一般通过 **`osmd.GraphicSheet`** 访问，无需单独 import 图模型类（除非从源码路径 deep import）。

---

## 7. 相关代码索引

| 主题 | 路径 |
|------|------|
| 导出 / 剥离 / 解析 | `src/lib/musicXmlAnnotations.ts` |
| 时间轴、视口选小节、spread、OSMD 估 tick | `src/lib/musicXmlNoteAnchors.ts` |
| 加载时剥离 XML | `src/views/home-page/HomePage.vue`（`stripAnnotationArtifacts`） |
| OSMD 仅导出 HTML、销毁宿主 | `src/lib/osmd.ts` |
| Overlay 样式 | `src/components/ScorePinchViewport.vue` |
| OSMD 读 words / Unknown 排版 | `taotao-lib-opensheetmusicdisplay/src/MusicalScore/ScoreIO/MusicSymbolModules/ExpressionReader.ts`、`.../Graphical/MusicSheetCalculator.ts` |
| 点击最近音、坐标变换 | `taotao-lib-opensheetmusicdisplay/src/MusicalScore/Graphical/GraphicalMusicSheet.ts` |

---

*文档随实现迭代；若修改 `buildWordsDefaultXYForExport` / `pickTimedNoteForViewportPlacement` / OSMD 生命周期等，请同步更新本文。*
