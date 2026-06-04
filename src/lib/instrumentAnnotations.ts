import type { Component } from 'vue'
import bassIcon from '@/assets/Instrument/BASS.svg'
import bassDrumIcon from '@/assets/Instrument/B.D.svg'
import brassIcon from '@/assets/Instrument/Brass.svg'
import clarinetIcon from '@/assets/Instrument/CL.svg'
import corIcon from '@/assets/Instrument/Cor.svg'
import englishHornIcon from '@/assets/Instrument/E.H.svg'
import fagIcon from '@/assets/Instrument/Fag.svg'
import fluteIcon from '@/assets/Instrument/FL.svg'
import harpIcon from '@/assets/Instrument/Harp.svg'
import oboeIcon from '@/assets/Instrument/Ob.svg'
import picoIcon from '@/assets/Instrument/PICO.svg'
import snareDrumIcon from '@/assets/Instrument/S.D.svg'
import tambourineIcon from '@/assets/Instrument/Tamb.svg'
import tbnIcon from '@/assets/Instrument/Tbn.svg'
import timpIcon from '@/assets/Instrument/Timp.svg'
import tptIcon from '@/assets/Instrument/Tpt.svg'
import tubaIcon from '@/assets/Instrument/TUBA.svg'
import violinIcon from '@/assets/Instrument/v1.svg'
import woodwindIcon from '@/assets/Instrument/WW.svg'
import BASSIconComponent from '@/components/icons/instruments/BASS.vue'
import BDIconComponent from '@/components/icons/instruments/B.D.vue'
import BrassIconComponent from '@/components/icons/instruments/Brass.vue'
import CLIconComponent from '@/components/icons/instruments/CL.vue'
import CorIconComponent from '@/components/icons/instruments/Cor.vue'
import FagIconComponent from '@/components/icons/instruments/Fag.vue'
import FLIconComponent from '@/components/icons/instruments/FL.vue'
import HarpIconComponent from '@/components/icons/instruments/Harp.vue'
import ObIconComponent from '@/components/icons/instruments/Ob.vue'
import EHIconComponent from '@/components/icons/instruments/E.H.vue'
import PICOIconComponent from '@/components/icons/instruments/PICO.vue'
import SDIconComponent from '@/components/icons/instruments/S.D.vue'
import TambIconComponent from '@/components/icons/instruments/Tamb.vue'
import TbnIconComponent from '@/components/icons/instruments/Tbn.vue'
import TimpIconComponent from '@/components/icons/instruments/Timp.vue'
import TptIconComponent from '@/components/icons/instruments/Tpt.vue'
import TUBAIconComponent from '@/components/icons/instruments/TUBA.vue'
import v1IconComponent from '@/components/icons/instruments/v1.vue'
import WWIconComponent from '@/components/icons/instruments/WW.vue'

export const annotationShortcuts = [
  { value: 'V1', name: '一提琴' },
  { value: 'V1首', name: '一提首席' },
  { value: 'V2', name: '二提琴' },
  { value: 'VL', name: '小提组' },
  { value: 'Va', name: '中提琴' },
  { value: 'Vc', name: '大提琴' },

  { value: 'BASS', name: '贝斯' },
  { value: 'CL', name: '黑管' },
  { value: 'E.H.', name: '英国管' },
  { value: 'Fag', name: '大管' },
  { value: 'FL', name: '长笛' },
  { value: 'Ob', name: '双簧管' },
  { value: 'PICO', name: '短笛' },
  { value: 'B.D', name: '大军鼓' },
  { value: 'S.D', name: '小军鼓' },
  
  { value: 'Tamb', name: '铃鼓' },
  { value: 'Timp', name: '定音鼓' },
  { value: 'Cor', name: '圆号' },
  { value: 'Tbn', name: '长号' },
  { value: 'Tpt', name: '小号' },
  { value: 'TUBA', name: '大号' },
  { value: 'Harp', name: '竖琴' },
  
  
  { value: 'Brass', name: '铜管' },
  { value: 'WW', name: '木管' },
  
  { value: 'da capo', name: '从头开始' },
] as const

export const instrumentAnnotationNameMap: Record<string, string> = Object.fromEntries(
  annotationShortcuts.map((item) => [item.value, item.name]),
)

export const instrumentAnnotationIconMap: Record<string, string> = {
  V1: violinIcon,
  V1首: violinIcon,
  V2: violinIcon,
  VL: violinIcon,
  Va: violinIcon,
  Vc: violinIcon,
  BASS: bassIcon,
  Harp: harpIcon,
  Ob: oboeIcon,
  'E.H.': englishHornIcon,
  FL: fluteIcon,
  PICO: picoIcon,
  Fag: fagIcon,
  CL: clarinetIcon,
  Cor: corIcon,
  Tpt: tptIcon,
  Tbn: tbnIcon,
  TUBA: tubaIcon,
  Brass: brassIcon,
  WW: woodwindIcon,
  Timp: timpIcon,
  'S.D': snareDrumIcon,
  'B.D': bassDrumIcon,
  Tamb: tambourineIcon,
}

type ParsedInstrumentAnnotationShortcut = {
  baseValue: string
  sectionNumber: string
  grouped: boolean
}

function parseInstrumentAnnotationShortcut(rawValue: string): ParsedInstrumentAnnotationShortcut | null {
  const text = rawValue.trim()
  if (!text) return null
  if (instrumentAnnotationNameMap[text]) {
    return {
      baseValue: text,
      sectionNumber: '',
      grouped: false,
    }
  }

  let candidate = text
  let grouped = false
  if (candidate.endsWith('s')) {
    grouped = true
    candidate = candidate.slice(0, -1)
  }
  if (!candidate) return null

  if (instrumentAnnotationNameMap[candidate]) {
    return {
      baseValue: candidate,
      sectionNumber: '',
      grouped,
    }
  }

  const numberMatch = candidate.match(/^(.*?)(\d+)$/)
  if (!numberMatch) return null
  const [, baseValue, sectionNumber] = numberMatch
  if (!baseValue || !instrumentAnnotationNameMap[baseValue]) return null

  return {
    baseValue,
    sectionNumber,
    grouped,
  }
}

export function getInstrumentAnnotationIcon(value: string): string {
  const parsed = parseInstrumentAnnotationShortcut(value)
  if (!parsed) return ''
  return instrumentAnnotationIconMap[parsed.baseValue] ?? ''
}

const instrumentAnnotationIconComponentMap: Record<string, Component> = {
  V1: v1IconComponent,
  V1首: v1IconComponent,
  V2: v1IconComponent,
  VL: v1IconComponent,
  Va: v1IconComponent,
  Vc: v1IconComponent,
  BASS: BASSIconComponent,
  Harp: HarpIconComponent,
  Ob: ObIconComponent,
  'E.H.': EHIconComponent,
  FL: FLIconComponent,
  PICO: PICOIconComponent,
  Fag: FagIconComponent,
  CL: CLIconComponent,
  Cor: CorIconComponent,
  Tpt: TptIconComponent,
  Tbn: TbnIconComponent,
  TUBA: TUBAIconComponent,
  Brass: BrassIconComponent,
  WW: WWIconComponent,
  Timp: TimpIconComponent,
  'S.D': SDIconComponent,
  'B.D': BDIconComponent,
  Tamb: TambIconComponent,
}

export function getInstrumentAnnotationIconComponent(value: string): Component | null {
  const parsed = parseInstrumentAnnotationShortcut(value)
  if (!parsed) return null
  return instrumentAnnotationIconComponentMap[parsed.baseValue] ?? null
}

export function isInstrumentAnnotationShortcut(value: string): boolean {
  return Boolean(parseInstrumentAnnotationShortcut(value))
}

export function getInstrumentAnnotationDisplayName(value: string): string {
  const parsed = parseInstrumentAnnotationShortcut(value)
  if (!parsed) return ''

  const sourceName = instrumentAnnotationNameMap[parsed.baseValue]
  if (!sourceName) return ''
  if (!parsed.sectionNumber && !parsed.grouped) return sourceName
  if (parsed.sectionNumber && parsed.grouped) return `${sourceName}${parsed.sectionNumber}个人`
  if (parsed.sectionNumber) return `${sourceName}${parsed.sectionNumber}`
  return `${sourceName}组`
}

export function formatAnnotationText(rawText: string): string {
  const text = rawText.trim()
  if (!text) return ''
  if (isInstrumentAnnotationShortcut(text)) return text
  return text
}
