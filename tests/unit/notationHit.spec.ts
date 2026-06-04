import { describe, expect, test } from 'vitest'
import { isNotationElementId, shouldApplyClickHighlight } from '@/lib/notationHit'

describe('isNotationElementId', () => {
  test('accepts verovio note and rest ids', () => {
    expect(isNotationElementId('note-abc')).toBe(true)
    expect(isNotationElementId('rest-xyz')).toBe(true)
    expect(isNotationElementId('chord-1')).toBe(true)
  })

  test('rejects structural container ids', () => {
    expect(isNotationElementId('page-1')).toBe(false)
    expect(isNotationElementId('m3_0')).toBe(false)
    expect(isNotationElementId('')).toBe(false)
  })
})

describe('shouldApplyClickHighlight', () => {
  test('does not highlight measure or page groups', () => {
    const root = document.createElement('div')
    const measure = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    measure.setAttribute('id', 'm3_0')
    measure.setAttribute('data-playback-id', 'm3_0')
    root.appendChild(measure)
    document.body.appendChild(root)

    expect(shouldApplyClickHighlight(measure, root)).toBe(false)

    root.remove()
  })

  test('highlights note path under verovio note group', () => {
    const root = document.createElement('div')
    const noteGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    noteGroup.setAttribute('id', 'note-123')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    noteGroup.appendChild(path)
    root.appendChild(noteGroup)
    document.body.appendChild(root)

    expect(shouldApplyClickHighlight(path, root)).toBe(true)

    root.remove()
  })

  test('highlights osmd note path under measure group', () => {
    const root = document.createElement('div')
    const measure = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    measure.setAttribute('id', 'm2_4')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    measure.appendChild(path)
    root.appendChild(measure)
    document.body.appendChild(root)

    expect(shouldApplyClickHighlight(path, root)).toBe(true)

    root.remove()
  })
})
