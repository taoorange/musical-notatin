import { describe, expect, it } from 'vitest'

import {
  buildFirstPartNoteTimeline,
  pickMusicSystemIndexForViewportAnchor,
  pickTimedNoteForViewportPlacement,
} from '@/lib/musicXmlNoteAnchors'
import type { OsmdInkNormMeasureSpan, OsmdMusicSystemNormBounds } from '@/lib/musicXmlNoteAnchors'

describe('pickMusicSystemIndexForViewportAnchor', () => {
  const fourSystems = [
    { top: 0.02, bottom: 0.2 },
    { top: 0.24, bottom: 0.42 },
    { top: 0.46, bottom: 0.64 },
    { top: 0.68, bottom: 0.86 },
  ]

  it('assigns inter-system gap above staff to the lower system', () => {
    // 第 34 小节在第二行：标注 y 常落在第一行 bottom 与第二行 top 之间
    expect(pickMusicSystemIndexForViewportAnchor(0.21, fourSystems)).toBe(1)
    expect(pickMusicSystemIndexForViewportAnchor(0.43, fourSystems)).toBe(2)
  })

  it('keeps first-system annotations on system 0', () => {
    expect(pickMusicSystemIndexForViewportAnchor(0.05, fourSystems)).toBe(0)
  })

  it('hits inside system band directly', () => {
    expect(pickMusicSystemIndexForViewportAnchor(0.3, fourSystems)).toBe(1)
  })
})

describe('pickTimedNoteForViewportPlacement', () => {
  function minimalScoreDoc(measureCount: number): Document {
    const measures = Array.from({ length: measureCount }, (_, i) => {
      const n = i + 1
      return `<measure number="${n}"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure>`
    }).join('')
    const xml = `<?xml version="1.0"?><score-partwise version="3.1"><part id="P1">${measures}</part></score-partwise>`
    return new DOMParser().parseFromString(xml, 'application/xml')
  }

  it('picks lower-system measure when nx matches upper row (m15 vs m36 regression)', () => {
    const doc = minimalScoreDoc(40)
    const part = doc.querySelector('part')!
    const measures = Array.from(part.children).filter((el) => el.localName === 'measure')
    const timeline = buildFirstPartNoteTimeline(doc)
    const systems: OsmdMusicSystemNormBounds[] = [
      { top: 0, bottom: 0.1 },
      { top: 0.1, bottom: 0.2 },
    ]
    const inkSpans: OsmdInkNormMeasureSpan[] = [
      { measureListIndex: 14, left: 0.766, right: 0.827, top: 0.02, bottom: 0.09 },
      { measureListIndex: 35, left: 0.766, right: 0.827, top: 0.11, bottom: 0.19 },
    ]
    const bounds = { start: 0, end: 39 }

    const m15 = pickTimedNoteForViewportPlacement(
      { page: 1, x: 0.781, y: 0.0066 },
      timeline,
      measures,
      1,
      [bounds],
      [inkSpans],
      [systems],
    )
    expect(m15.picked).not.toBeNull()
    expect(measures.indexOf(m15.picked!.measure)).toBe(14)

    const m36 = pickTimedNoteForViewportPlacement(
      { page: 1, x: 0.816, y: 0.103 },
      timeline,
      measures,
      1,
      [bounds],
      [inkSpans],
      [systems],
    )
    expect(m36.picked).not.toBeNull()
    expect(measures.indexOf(m36.picked!.measure)).toBe(35)
  })
})
