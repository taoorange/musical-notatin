import JSZip from 'jszip'

/**
 * Compressed MusicXML (.mxl) is a ZIP containing META-INF/container.xml
 * and one or more MusicXML documents.
 */
export async function mxlToMusicXmlString(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)

  const container = zip.file('META-INF/container.xml')
  if (container) {
    const xml = await container.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const rootfile = doc.querySelector('rootfile')
    const fullPath = rootfile?.getAttribute('full-path')?.replace(/^\//, '')
    if (fullPath) {
      const entry = zip.file(fullPath)
      if (entry) {
        return entry.async('string')
      }
    }
  }

  const names = Object.keys(zip.files).filter((p) => !zip.files[p].dir)
  for (const name of names) {
    const lower = name.toLowerCase()
    if (lower.endsWith('.musicxml')) {
      const f = zip.file(name)
      if (f) return f.async('string')
    }
  }
  for (const name of names) {
    if (name.startsWith('META-INF')) continue
    if (name.toLowerCase().endsWith('.xml')) {
      const f = zip.file(name)
      if (f) return f.async('string')
    }
  }

  throw new Error('无法在 MXL 中找到有效的 MusicXML 条目')
}
