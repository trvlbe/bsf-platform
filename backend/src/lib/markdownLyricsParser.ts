import type { ParsedLyrics, ParsedSection } from '../types.js'

export function parseMarkdownLyrics(markdown: string): ParsedLyrics {
  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { name: line.slice(3).trim(), lines: [] }
    } else if (line && current) {
      current.lines.push(line)
    }
  }
  if (current) sections.push(current)

  return {
    sections,
    allLines: sections.flatMap(s => s.lines),
  }
}
