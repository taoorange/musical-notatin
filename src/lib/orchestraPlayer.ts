import { createOrchestraPerfTimer } from './orchestraPerf'
import { getCachedSoundfont, putCachedSoundfont } from './soundfontCache'

/** 默认乐团音色库（远程静态资源）。 */
export const DEFAULT_ORCHESTRA_SOUNDFONT_URL =
  'https://chncpa-1331294305.cos.ap-beijing.myqcloud.com/staff/static/MuseScore_General.sf3'
/** libfluidsynth 本地脚本地址（默认优先使用）。 */
const DEFAULT_LIBFLUIDSYNTH_SCRIPT_URL = '/soundfonts/libfluidsynth-2.4.6-with-libsndfile.js'
/** libfluidsynth 远程兜底脚本地址（本地不可用时回退）。 */
const FALLBACK_LIBFLUIDSYNTH_SCRIPT_URL = 'https://unpkg.com/js-synthesizer@1.13.0/externals/libfluidsynth-2.4.6-with-libsndfile.js'
/** js-synthesizer 本地脚本地址（默认优先使用）。 */
const DEFAULT_JS_SYNTHESIZER_SCRIPT_URL = '/soundfonts/js-synthesizer.js'
/** js-synthesizer 远程兜底脚本地址（本地不可用时回退）。 */
const FALLBACK_JS_SYNTHESIZER_SCRIPT_URL =
  'https://unpkg.com/js-synthesizer@1.13.0/dist/js-synthesizer.js'
/** 内置 SoundFont 兜底地址列表（主地址失败时依次尝试）。 */
const SOUNDFONT_FALLBACK_URLS = [ 'https://raw.githubusercontent.com/musescore/MuseScore/master/share/sound/MS%20Basic.sf3' ]

/**
 * 将 base64 MIDI 字符串转为二进制 ArrayBuffer。
 * 支持传入纯 base64 或 data URI（自动剥离逗号前缀）。
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const trimmed = base64.trim()
  const payload = trimmed.includes(',') ? trimmed.slice(trimmed.indexOf(',') + 1) : trimmed
  if (!payload) {
    throw new Error('MIDI 数据为空，无法播放')
  }
  const binary = window.atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

interface OrchestraPlayerOptions {
  /** 播放状态变更回调（开始/停止）。 */
  onPlayingChange?: (playing: boolean) => void
}

/** 与 js-synthesizer 对齐的 FluidSynth 实例最小接口。 */
interface FluidSynthLike {
  init(sampleRate: number): void
  createAudioNode(context: AudioContext, frameSize?: number): AudioNode
  loadSFont(bin: ArrayBuffer): Promise<number>
  unloadSFontAsync(id: number): Promise<void>
  close(): void
  setGain(gain: number): void
  resetPlayer(): Promise<void>
  addSMFDataToPlayer(bin: ArrayBuffer): Promise<void>
  playPlayer(): Promise<void>
  waitForPlayerStopped(): Promise<void>
  retrievePlayerCurrentTick(): Promise<number>
  seekPlayer(ticks: number): void
  stopPlayer(): void
}

/** js-synthesizer 的日志等级枚举类型声明。 */
interface JSSynthLogLevel {
  readonly Panic: 0
  readonly Error: 1
  readonly Warning: 2
  readonly Info: 3
  readonly Debug: 4
}

/** 挂载到全局对象的 JSSynth API 结构。 */
interface JSSynthGlobal {
  waitForReady: () => Promise<void>
  Synthesizer: {
    new (): FluidSynthLike
  }
  LogLevel: JSSynthLogLevel
  disableLogging(level: number): void
  restoreLogging(): void
}

/** 扩展 globalThis，声明可选 JSSynth 全局对象。 */
type GlobalWithJSSynth = typeof globalThis & { JSSynth?: JSSynthGlobal }
/** 扩展 window，缓存一次脚本加载 Promise，避免重复注入。 */
type BrowserWithEnv = typeof window & { __orchestraScriptsReady?: Promise<void> }

/** 获取全局 JSSynth 实例，不存在则提示先完成准备流程。 */
function getJSSynthGlobal(): JSSynthGlobal {
  const g = globalThis as GlobalWithJSSynth
  if (!g.JSSynth) {
    throw new Error('JSSynth 未加载，请先准备乐器音色库')
  }
  return g.JSSynth
}

/**
 * 组装 SoundFont 候选地址：
 * 主地址 + 环境变量 fallback + 内置 fallback，并去重。
 */
function buildSoundfontCandidateUrls(primary: string): string[] {
  const envFallback = (import.meta.env.VITE_ORCHESTRA_SOUNDFONT_FALLBACK_URLS as string | undefined)?.trim()
  const extra = envFallback
    ? envFallback
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : []
  return Array.from(new Set([primary, ...extra, ...SOUNDFONT_FALLBACK_URLS]))
}

/**
 * 加载 SoundFont 二进制。
 * 优先命中 IndexedDB 缓存，失败后按候选 URL 逐个网络请求。
 */
async function loadSoundfontBinary(primaryUrl: string): Promise<{ data: ArrayBuffer; loadedFrom: string }> {
  const candidates = buildSoundfontCandidateUrls(primaryUrl)
  const failures: string[] = []
  for (const url of candidates) {
    const cached = await getCachedSoundfont(url)
    if (cached && cached.byteLength > 0) {
      return { data: cached, loadedFrom: `idb:${url}` }
    }
    try {
      const response = await fetch(url)
      if (!response.ok) {
        failures.push(`${url} -> HTTP ${response.status}`)
        continue
      }
      const data = await response.arrayBuffer()
      void putCachedSoundfont(url, data)
      return { data, loadedFrom: url }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failures.push(`${url} -> ${reason}`)
    }
  }
  throw new Error(`加载音色库失败，已尝试 ${candidates.length} 个地址：${failures.join(' | ')}`)
}

/** 动态加载脚本 URL（若已存在同 src script，则复用其加载状态）。 */
function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll('script')).find((item) => item.src === url)
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`脚本加载失败：${url}`)), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.dataset.loaded = 'false'
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error(`脚本加载失败：${url}`))
    document.head.appendChild(script)
  })
}

/**
 * 临时拦截 console.error，过滤已知无害噪音日志后执行异步操作。
 * 结束后总会恢复原始 console.error。
 */
async function withFilteredConsoleError<T>(
  shouldIgnore: (message: string) => boolean,
  action: () => Promise<T>,
): Promise<T> {
  const original = console.error
  console.error = (...args: unknown[]) => {
    const text = args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        if (arg instanceof Error) return arg.message
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      })
      .join(' ')
    if (shouldIgnore(text)) return
    original(...args)
  }
  try {
    return await action()
  } finally {
    console.error = original
  }
}

/**
 * 确保 FluidSynth 与 js-synthesizer 脚本已在浏览器中就绪。
 * 使用 window.__orchestraScriptsReady 做单例级并发复用。
 */
async function ensureSynthScriptsReady(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持浏览器音频播放')
  }
  const w = window as BrowserWithEnv
  if (w.__orchestraScriptsReady) {
    await w.__orchestraScriptsReady
    return
  }
  const libUrl =
    (import.meta.env.VITE_LIBFLUIDSYNTH_SCRIPT_URL as string | undefined)?.trim() ||
    DEFAULT_LIBFLUIDSYNTH_SCRIPT_URL
  const synthUrl =
    (import.meta.env.VITE_JS_SYNTHESIZER_SCRIPT_URL as string | undefined)?.trim() ||
    DEFAULT_JS_SYNTHESIZER_SCRIPT_URL

  w.__orchestraScriptsReady = (async () => {
    if (libUrl === DEFAULT_LIBFLUIDSYNTH_SCRIPT_URL) {
      try {
        await loadScript(libUrl)
      } catch {
        await loadScript(FALLBACK_LIBFLUIDSYNTH_SCRIPT_URL)
      }
    } else {
      await loadScript(libUrl)
    }
    if (synthUrl === DEFAULT_JS_SYNTHESIZER_SCRIPT_URL) {
      try {
        await loadScript(synthUrl)
      } catch {
        await loadScript(FALLBACK_JS_SYNTHESIZER_SCRIPT_URL)
      }
    } else {
      await loadScript(synthUrl)
    }
    getJSSynthGlobal()
  })()

  try {
    await w.__orchestraScriptsReady
  } catch (e) {
    w.__orchestraScriptsReady = undefined
    throw e
  }
}

export class OrchestraPlayer {
  /** WebAudio 上下文，负责最终音频输出。 */
  private context: AudioContext | null = null

  /** FluidSynth 实例（通过 JSSynth.Synthesizer 创建）。 */
  private synth: FluidSynthLike | null = null

  /** 挂接到 AudioContext 的输出节点。 */
  private audioNode: AudioNode | null = null

  /** 当前已加载的 SoundFont ID（用于卸载释放）。 */
  private soundfontId: number | null = null

  /** 是否已完成 prepare（脚本 + 合成器 + 音色库均可用）。 */
  private ready = false

  /** 当前是否处于播放中。 */
  private playing = false

  /** 最近一次加载到播放器的 MIDI 二进制（用于 resume）。 */
  private midiData: ArrayBuffer | null = null

  /** 暂停时保存的 tick 位置（resume 时 seek）。 */
  private pausedTick = 0

  /** 对外播放状态回调。 */
  private onPlayingChange?: (playing: boolean) => void

  /** 音色库来源提示（UI 展示用）。 */
  private soundfontSourceHint = '未准备'

  /** 构造播放器，可注入播放状态回调。 */
  constructor(options: OrchestraPlayerOptions = {}) {
    this.onPlayingChange = options.onPlayingChange
  }

  /** 查询播放器是否已准备就绪。 */
  isReady() {
    return this.ready
  }

  /** 查询播放器是否正在播放。 */
  isPlaying() {
    return this.playing
  }

  /** 返回当前音色库来源提示。 */
  getSoundfontSourceHint() {
    return this.soundfontSourceHint
  }

  /** 内部统一更新播放状态并触发回调。 */
  private setPlaying(next: boolean) {
    if (this.playing === next) return
    this.playing = next
    this.onPlayingChange?.(next)
  }

  /**
   * 准备播放器：
   * 1) 加载脚本；2) 创建 AudioContext + Synth；3) 加载 SoundFont。
   * 重复调用在 ready=true 时会被快速跳过。
   */
  async prepare(soundfontUrl: string): Promise<void> {
    if (this.ready) return

    const perf = createOrchestraPerfTimer('orchestraPlayer.prepare')

    await ensureSynthScriptsReady()
    perf.mark('ensureSynthScriptsReady')

    const jsSynth = getJSSynthGlobal()
    await jsSynth.waitForReady()
    perf.mark('jsSynth.waitForReady')

    this.context = new AudioContext()
    const synth = new jsSynth.Synthesizer()
    synth.init(this.context.sampleRate)
    const node = synth.createAudioNode(this.context, 8192)
    node.connect(this.context.destination)
    perf.mark('initAudioContextAndSynth')

    const { data: sfData, loadedFrom } = await loadSoundfontBinary(soundfontUrl)
    perf.mark('loadSoundfontBinary')

    const sfontId = await withFilteredConsoleError(
      (message) =>
        message.includes('fluid_stat is a stub') ||
        message.includes('libfluidsynth') ||
        message.includes('put_char'),
      () => synth.loadSFont(sfData),
    )
    perf.mark('loadSFont')

    if (loadedFrom.startsWith('idb:')) {
      this.soundfontSourceHint = '本地缓存'
    } else if (loadedFrom.startsWith('/')) {
      this.soundfontSourceHint = '本地文件'
    } else {
      this.soundfontSourceHint = '网络下载'
    }

    this.synth = synth
    this.audioNode = node
    this.soundfontId = sfontId
    this.ready = true

    perf.finish({
      soundfontUrl,
      loadedFrom,
      sfBytes: sfData.byteLength,
      soundfontSourceHint: this.soundfontSourceHint,
    })
  }

  /**
   * 从 base64 MIDI 重新开始播放。
   * 会重置内部 player，并将 pausedTick 清零。
   */
  async playFromBase64Midi(midiBase64: string): Promise<void> {
    if (!this.synth || !this.context) {
      throw new Error('播放器未初始化，请先准备音色库')
    }
    if (this.context.state !== 'running') {
      await this.context.resume()
    }
    const midiData = base64ToArrayBuffer(midiBase64)
    this.midiData = midiData
    this.pausedTick = 0
    await this.synth.resetPlayer()
    await this.synth.addSMFDataToPlayer(midiData)
    await this.synth.playPlayer()
    this.setPlaying(true)
    void this.synth.waitForPlayerStopped().then(() => this.setPlaying(false))
  }

  /**
   * 从 pause 保存点恢复播放。
   * 依赖之前已加载过 midiData；否则抛错提示先播放一次。
   */
  async resume(): Promise<void> {
    if (!this.synth || !this.context) {
      throw new Error('播放器未初始化，请先准备音色库')
    }
    if (!this.midiData) {
      throw new Error('没有可恢复的 MIDI 数据，请先播放一次')
    }
    if (this.context.state !== 'running') {
      await this.context.resume()
    }
    await this.synth.resetPlayer()
    await this.synth.addSMFDataToPlayer(this.midiData)
    if (this.pausedTick > 0) {
      this.synth.seekPlayer(this.pausedTick)
    }
    await this.synth.playPlayer()
    this.setPlaying(true)
    void this.synth.waitForPlayerStopped().then(() => this.setPlaying(false))
  }

  /** 暂停播放并记录当前位置 tick。 */
  async pause(): Promise<void> {
    if (!this.synth) return
    try {
      this.pausedTick = await this.synth.retrievePlayerCurrentTick()
    } catch {
      this.pausedTick = 0
    }
    this.synth.stopPlayer()
    this.setPlaying(false)
  }

  /** 停止播放并清空暂停点（但不清理 MIDI 数据）。 */
  stop() {
    if (!this.synth) return
    this.pausedTick = 0
    this.synth.stopPlayer()
    this.setPlaying(false)
  }

  /** 读取当前播放 tick（失败时返回 0）。 */
  async getCurrentTick(): Promise<number> {
    if (!this.synth) return 0
    try {
      const tick = await this.synth.retrievePlayerCurrentTick()
      if (!Number.isFinite(tick)) return 0
      return Math.max(0, Math.round(tick))
    } catch {
      return 0
    }
  }

  /** 设置 seek 目标 tick，供下次 resume 时跳转到指定位置。 */
  seekToTick(tick: number) {
    this.pausedTick = Math.max(0, Math.floor(tick))
  }

  /**
   * 预加载 MIDI 数据到播放器内存，不触发播放。
   * 调用后可通过 seekToTick + resume 从任意位置开始播放。
   */
  loadMidiData(midiBase64: string) {
    this.midiData = base64ToArrayBuffer(midiBase64)
  }

  /** 设置合成器增益（0~2 区间钳制）。 */
  setGain(gain: number) {
    if (!this.synth) return
    const clamped = Math.max(0, Math.min(2, gain))
    this.synth.setGain(clamped)
  }

  /** 清理已缓存的 MIDI 数据与暂停点。 */
  clearMidi() {
    this.midiData = null
    this.pausedTick = 0
  }

  /**
   * 彻底释放播放器资源：
   * 停止播放、卸载 SoundFont、断开节点、关闭 synth/context 并重置状态。
   */
  async dispose() {
    this.stop()
    this.clearMidi()
    if (this.synth && this.soundfontId !== null) {
      try {
        await this.synth.unloadSFontAsync(this.soundfontId)
      } catch {
        // ignore dispose failure
      }
    }
    if (this.audioNode) {
      try {
        this.audioNode.disconnect()
      } catch {
        // ignore disconnect failure
      }
    }
    if (this.synth) {
      this.synth.close()
    }
    if (this.context) {
      await this.context.close()
    }
    this.context = null
    this.synth = null
    this.audioNode = null
    this.soundfontId = null
    this.ready = false
    this.soundfontSourceHint = '未准备'
    this.setPlaying(false)
  }
}


