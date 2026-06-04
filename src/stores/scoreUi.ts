import { defineStore } from 'pinia'

export type ScoreViewMode = 'page' | 'scroll'
export type ScoreRenderEngine = 'verovio' | 'osmd'

interface ScoreUiState {
  viewMode: ScoreViewMode
  renderEngine: ScoreRenderEngine
  /** Verovio 页面宽度（影响分页与标注坐标） */
  verovioPageWidth: number
  /** OSMD 离屏渲染容器宽度（px），影响分页与 ink 归一化；需与打开乐谱时一致 */
  osmdPageWidth: number
  /** 为 true 时 OSMD 纸张宽高从 MusicXML `<page-layout>` 读取；为 false 时使用手动页高（宽仍取自文件） */
  osmdUseFilePageDimensions: boolean
  /** 手动模式：纸张宽度（MusicXML tenths，与 page-width 同单位） */
  osmdManualPageWidthTenths: number
  /** 手动模式：纸张高度（MusicXML tenths，与 page-height 同单位） */
  osmdManualPageHeightTenths: number
  /** 是否显示 Verovio 页眉（标题等信息） */
  verovioShowHeader: boolean
  /** 是否显示 Verovio 页脚信息 */
  verovioShowFooter: boolean
  /** 是否处于谱面标注交互模式 */
  annotationMode: boolean
  /** 是否在视图中绘制标注层（数据仍保留，可导出） */
  annotationsVisible: boolean
  /** 新增标注时的默认文案 */
  annotationDraftText: string
  /** 新增标注时的默认颜色（如 #ff0000） */
  annotationColor: string
  /** 当前选中的标注快捷项 value；为空表示未选中快捷项 */
  selectedAnnotationShortcut: string
  /** 滚动模式播放时是否自动跟随指示线滚动视口 */
  scrollPlaybackAutoFollowEnabled: boolean
}

export const useScoreUiStore = defineStore('score-ui', {
  state: (): ScoreUiState => ({
    viewMode: 'page',
    renderEngine: 'osmd',
    verovioPageWidth: 4000,
    osmdPageWidth: 3000,
    osmdUseFilePageDimensions: true,
    osmdManualPageWidthTenths: 1200,
    osmdManualPageHeightTenths: 1697,
    verovioShowHeader: true,
    verovioShowFooter: false,
    annotationMode: false,
    annotationsVisible: true,
    annotationDraftText: '标注',
    annotationColor: '#ff0000',
    selectedAnnotationShortcut: '',
    scrollPlaybackAutoFollowEnabled: true,
  }),
  actions: {
    setViewMode(mode: ScoreViewMode) {
      this.viewMode = mode
    },
    setRenderEngine(engine: ScoreRenderEngine) {
      this.renderEngine = engine
    },
    setVerovioPageWidth(width: number) {
      this.verovioPageWidth = Math.max(600, Math.min(10000, Math.round(width)))
    },
    setOsmdPageWidth(width: number) {
      this.osmdPageWidth = Math.max(600, Math.min(10000, Math.round(width)))
    },
    setOsmdUseFilePageDimensions(useFile: boolean) {
      this.osmdUseFilePageDimensions = useFile
    },
    setOsmdManualPageWidthTenths(tenths: number) {
      this.osmdManualPageWidthTenths = Math.max(100, Math.min(20000, Math.round(tenths * 100) / 100))
    },
    setOsmdManualPageHeightTenths(tenths: number) {
      this.osmdManualPageHeightTenths = Math.max(100, Math.min(20000, Math.round(tenths * 100) / 100))
    },
    setVerovioShowHeader(show: boolean) {
      this.verovioShowHeader = show
    },
    setVerovioShowFooter(show: boolean) {
      this.verovioShowFooter = show
    },
    toggleAnnotationMode() {
      this.annotationMode = !this.annotationMode
    },
    toggleAnnotationsVisible() {
      this.annotationsVisible = !this.annotationsVisible
    },
    /** 打开新乐谱或清空当前谱面时，恢复默认展示（不重置文字/颜色偏好） */
    resetAnnotationPresentationForNewScore() {
      this.annotationsVisible = true
    },
    setSelectedAnnotationShortcut(value: string) {
      this.selectedAnnotationShortcut = value
    },
    setScrollPlaybackAutoFollowEnabled(enabled: boolean) {
      this.scrollPlaybackAutoFollowEnabled = enabled
    },
    toggleScrollPlaybackAutoFollow() {
      this.scrollPlaybackAutoFollowEnabled = !this.scrollPlaybackAutoFollowEnabled
    },
  },
  persist: {
    /** 升级 key 后仍保留各字段，默认引擎为 OSMD（旧 key 下曾持久化 verovio 的需手动切一次或清站点数据） */
    key: 'five-line-staff:score-ui:v3',
    storage: localStorage,
    pick: [
      'viewMode',
      'renderEngine',
      'verovioPageWidth',
      'osmdPageWidth',
      'osmdUseFilePageDimensions',
      'osmdManualPageWidthTenths',
      'osmdManualPageHeightTenths',
      'verovioShowHeader',
      'verovioShowFooter',
      'annotationMode',
      'annotationsVisible',
      'annotationDraftText',
      'annotationColor',
      'selectedAnnotationShortcut',
      'scrollPlaybackAutoFollowEnabled',
    ],
  },
})
