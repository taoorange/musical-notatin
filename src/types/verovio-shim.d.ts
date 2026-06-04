declare module 'verovio/wasm' {
  const createVerovioModule: () => Promise<unknown>
  export default createVerovioModule
}

declare module 'verovio/esm' {
  interface VerovioOptions {
    [key: string]: unknown
  }

  /** Verovio `renderToTimemap()` 返回的单个时间映射条目 */
  export interface TimemapEntry {
    /** 归一化时间戳 [0, 1] */
    tstamp: number
    /** 当前所在小节号 */
    measureOn: number
    /** 当前所在页码 */
    pageOn: number
    /** 当前所在系统序号（Verovio 的可选字段，若启用 system 划分则可能存在） */
    systemOn?: number
    /** 当前速度 (BPM) */
    tempo: number
  }

  /** Verovio `getElementsAtTime()` 返回的结构 */
  export interface ElementsAtTimeResult {
    page: number
    notes: string[]
    rests: string[]
  }

  export class VerovioToolkit {
    constructor(module: unknown)
    loadData(data: string): number
    renderToSVG(pageNo?: number, xmlDeclaration?: boolean): string
    /** 生成时间映射表，返回各时间点的 tstamp / measureOn / pageOn / tempo */
    renderToTimemap(): TimemapEntry[]
    /** 生成 MIDI 数据（Base64），调用后启用 getElementsAtTime / getTimeForElement 等查询 */
    renderToMIDI(): string
    /** 查询给定毫秒时间点上活跃的元素 ID 列表，必须先调用 renderToMIDI() */
    getElementsAtTime(millisec: number): ElementsAtTimeResult
    /** 元素所在页码（1-based），需先 loadData + renderToMIDI */
    getPageWithElement(xmlId: string): number
    /** 元素起始时间（多为毫秒；若数值过小会按秒再乘 1000 理解），需先 renderToMIDI */
    getTimeForElement(xmlId: string): number
    /** 元素时间区间等信息的 JSON，需先 renderToMIDI */
    getTimesForElement(xmlId: string): unknown
    getPageCount(): number
    setOptions(options: VerovioOptions): boolean
  }
  export function enableLog(level: number, verovioModule: unknown): void
  export const LOG_OFF: number
}
