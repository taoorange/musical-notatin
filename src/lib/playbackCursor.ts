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
 * 解析 MIDI 文件总 tick，用于把当前播放 tick 映射到乐谱位置。
 */
export function getMidiTotalTicksFromBase64(base64: string): number {
  const bytes = decodeBase64MidiPayload(base64)
  if (bytes.length < 14) return 0
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') return 0

  const headerLength = readU32BE(bytes, 4)
  let offset = 8 + headerLength
  if (offset >= bytes.length) return 0

  let maxTick = 0
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
      maxTick = Math.max(maxTick, absTick)

      let status = bytes[trackOffset]
      if (status < 0x80) {
        if (runningStatus === 0) break
        status = runningStatus
      } else {
        trackOffset += 1
        if (status < 0xf0) {
          runningStatus = status
        }
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

  return Math.max(0, maxTick)
}

export function clampPlaybackProgress(currentTick: number, totalTicks: number): number {
  if (!Number.isFinite(currentTick) || !Number.isFinite(totalTicks) || totalTicks <= 0) return 0
  return Math.max(0, Math.min(1, currentTick / totalTicks))
}

export function mapProgressToPagePosition(progress: number, totalPages: number): {
  page: number
  inPageProgress: number
} {
  const safePages = Math.max(1, Math.floor(totalPages || 1))
  const clampedProgress = Math.max(0, Math.min(1, progress))
  if (clampedProgress >= 1) {
    return { page: safePages, inPageProgress: 1 }
  }
  const absolute = clampedProgress * safePages
  const page = Math.min(safePages, Math.floor(absolute) + 1)
  const inPageProgress = absolute - Math.floor(absolute)
  return { page, inPageProgress: Math.max(0, Math.min(1, inPageProgress)) }
}

/**
 * 基于页面边界数组（由 Verovio `renderToTimemap` 提取）进行精确的页面位置映射。
 *
 * 使用二分查找找到当前 progress 所在的页面，并在页内按边界比例插值 inPageProgress，
 * 避免线性映射中"所有页 tick 密度相同"的错误假设。
 *
 * @param progress - 当前播放进度 [0, 1]
 * @param totalPages - 总页数
 * @param boundaries - 每页结束时的归一化边界值，长度 = totalPages，严格递增
 * @returns 当前页码和页内进度
 */
export function mapProgressToPagePositionAccurate(
  progress: number,
  totalPages: number,
  boundaries: number[],
): { page: number; inPageProgress: number } {
  const safePages = Math.max(1, Math.floor(totalPages || 1))
  const clampedProgress = Math.max(0, Math.min(1, progress))

  if (safePages <= 1) {
    return { page: 1, inPageProgress: clampedProgress }
  }
  if (clampedProgress <= 0) {
    return { page: 1, inPageProgress: 0 }
  }
  if (clampedProgress >= 1) {
    return { page: safePages, inPageProgress: 1 }
  }

  // 二分查找第一个 boundary[i] >= clampedProgress
  let lo = 0
  let hi = boundaries.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (boundaries[mid] < clampedProgress) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  const pageIndex = lo
  const page = Math.min(safePages, pageIndex + 1)
  const prevBoundary = pageIndex > 0 ? boundaries[pageIndex - 1] : 0
  const curBoundary = boundaries[pageIndex] ?? 1
  const span = curBoundary - prevBoundary
  const inPageProgress = span > 1e-9
    ? (clampedProgress - prevBoundary) / span
    : 0

  return { page, inPageProgress: Math.max(0, Math.min(1, inPageProgress)) }
}
