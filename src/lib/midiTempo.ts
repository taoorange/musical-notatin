/**
 * MIDI 速度事件
 */
export interface MidiTempoEvent {
  /** 绝对 MIDI tick（从轨道开头累计） */
  tick: number
  /** 每四分音符微秒数 */
  microSecondsPerQN: number
}

/**
 * MIDI 速度映射表
 */
export interface MidiTempoMap {
  /** 每四分音符的 tick 数（Pulses Per Quarter Note） */
  ppq: number
  /** 按 tick 递增排序的速度事件列表 */
  events: MidiTempoEvent[]
}

function decodeBase64MidiPayload(base64: string): Uint8Array {
  const trimmed = base64.trim()
  const payload = trimmed.includes(',') ? trimmed.slice(trimmed.indexOf(',') + 1) : trimmed
  if (!payload) {
    throw new Error('MIDI 数据为空')
  }
  const binary = window.atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0
}

function readVarLen(bytes: Uint8Array, start: number): { value: number; nextOffset: number } {
  let value = 0
  let offset = start
  for (let i = 0; i < 4 && offset < bytes.length; i += 1) {
    const b = bytes[offset]
    value = (value << 7) | (b & 0x7f)
    offset += 1
    if ((b & 0x80) === 0) {
      return { value, nextOffset: offset }
    }
  }
  return { value, nextOffset: offset }
}

/**
 * 解析 MIDI Base64 二进制，提取 PPQ 和所有速度事件，构建速度映射表。
 *
 * 扫描所有 MTrk 轨道中的 FF 51 03 meta 事件（Set Tempo），
 * 记录每个速度事件发生的绝对 tick 和每四分音符微秒数。
 * 若 MIDI 使用 SMPTE 时间划分（bit 15 = 1），则回退到 120 BPM 默认值。
 *
 * @param base64 - MIDI 数据的 Base64 字符串
 * @returns 包含 PPQ 和速度事件列表的映射表
 */
export function parseMidiTempoMap(base64: string): MidiTempoMap {
  const bytes = decodeBase64MidiPayload(base64)
  if (bytes.length < 14) return { ppq: 480, events: [] }
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') return { ppq: 480, events: [] }

  const headerLength = readU32BE(bytes, 4)
  let offset = 8 + headerLength

  // 读取时间划分（bytes 12-13），高位为 0 表示 PPQ 格式
  const division = ((bytes[12] << 8) | bytes[13]) & 0xffff
  const ppq = (division & 0x8000) === 0 ? division : 480

  const events: MidiTempoEvent[] = []

  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    )
    const chunkLen = readU32BE(bytes, offset + 4)
    offset += 8
    if (offset + chunkLen > bytes.length) break
    if (chunkId !== 'MTrk') {
      offset += chunkLen
      continue
    }

    let trackOffset = offset
    const trackEnd = offset + chunkLen
    let absTick = 0
    let runningStatus = 0

    while (trackOffset < trackEnd) {
      const delta = readVarLen(bytes, trackOffset)
      absTick += delta.value
      trackOffset = delta.nextOffset
      if (trackOffset >= trackEnd) break

      let status = bytes[trackOffset]
      if (status < 0x80) {
        if (runningStatus === 0) break
        status = runningStatus
      } else {
        trackOffset += 1
        if (status < 0xf0) {
          runningStatus = status
        } else {
          runningStatus = 0
        }
      }

      // FF 51 03: Set Tempo meta event
      if (
        status === 0xff &&
        trackOffset < trackEnd &&
        bytes[trackOffset] === 0x51
      ) {
        trackOffset += 1
        const len = readVarLen(bytes, trackOffset)
        trackOffset = len.nextOffset
        if (len.value >= 3 && trackOffset + 3 <= trackEnd) {
          const microSecPerQN =
            (bytes[trackOffset] << 16) |
            (bytes[trackOffset + 1] << 8) |
            bytes[trackOffset + 2]
          events.push({ tick: absTick, microSecondsPerQN: microSecPerQN })
          trackOffset += 3
        }
        continue
      }

      if (status === 0xff) {
        if (trackOffset >= trackEnd) break
        trackOffset += 1 // meta type
        const len = readVarLen(bytes, trackOffset)
        trackOffset = len.nextOffset + len.value
        continue
      }

      if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(bytes, trackOffset)
        trackOffset = len.nextOffset + len.value
        continue
      }

      const high = status & 0xf0
      const dataBytes = high === 0xc0 || high === 0xd0 ? 1 : 2
      if (bytes[trackOffset] >= 0x80) {
        trackOffset += 1
      }
      trackOffset += dataBytes
    }

    offset += chunkLen
  }

  // 若未找到任何 tempo meta 事件，按默认 120 BPM 回退，避免 tick→ms 得到 0。
  if (events.length === 0) {
    events.push({ tick: 0, microSecondsPerQN: 500000 })
  }

  // 按 tick 排序
  events.sort((a, b) => a.tick - b.tick)

  return { ppq, events }
}

/**
 * 将 MIDI tick 转换为以毫秒为单位的墙钟时间。
 *
 * 遍历速度事件段落，累计各段落时长：
 *   segmentMs = (segmentTicks * microSecondsPerQN) / (ppq * 1000)
 *
 * @param tick - 绝对 MIDI tick
 * @param ppq - 每四分音符 tick 数
 * @param events - 按 tick 升序的速度事件列表
 * @returns 对应毫秒数
 */
export function ticksToMilliseconds(
  tick: number,
  ppq: number,
  events: MidiTempoEvent[],
): number {
  if (!Number.isFinite(tick) || tick <= 0) return 0
  if (ppq <= 0 || events.length === 0) return 0

  let remaining = tick
  let ms = 0

  for (let i = 0; i < events.length && remaining > 0; i += 1) {
    const current = events[i]
    const next = events[i + 1]
    const segmentEnd = next ? next.tick : Number.POSITIVE_INFINITY
    const segmentTicks = Math.min(remaining, segmentEnd - current.tick)
    ms += (segmentTicks * current.microSecondsPerQN) / (ppq * 1000)
    remaining -= segmentTicks
  }

  return ms
}

/**
 * 将墙钟毫秒线性映射到 MIDI tick（与整首总时长对齐）。
 * 用于 Verovio `getTimeForElement` 与 MusicXML 按小节累加 tick 的粗略对齐；变拍乐曲为近似。
 */
export function millisecondsToTickLinear(ms: number, totalMs: number, totalTicks: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  if (!Number.isFinite(totalMs) || totalMs <= 0 || !Number.isFinite(totalTicks) || totalTicks <= 0) return 0
  const t = Math.round((ms / totalMs) * totalTicks)
  return Math.max(0, Math.min(Math.max(0, totalTicks - 1), t))
}
