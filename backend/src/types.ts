export interface ParsedSection {
  name: string
  lines: string[]
}

export interface ParsedLyrics {
  sections: ParsedSection[]
  allLines: string[]  // flat array of all lyric lines
}
