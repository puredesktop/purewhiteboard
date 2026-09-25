import type { WhiteboardElementLike } from './whiteboardScene'
/** Report text-on-text collisions; labels inside their shapes are intentional. */
export function textOverlaps(elements: readonly WhiteboardElementLike[]): Array<{ first: string; second: string }> {
  const text = elements.filter(element => !element.isDeleted && element.type === 'text' && element.text?.trim())
  const overlaps: Array<{ first: string; second: string }> = []
  for (let i = 0; i < text.length; i++) for (let j = i + 1; j < text.length; j++) {
    const a = text[i], b = text[j]
    if (a.x < b.x + (b.width ?? 0) && a.x + (a.width ?? 0) > b.x && a.y < b.y + (b.height ?? 0) && a.y + (a.height ?? 0) > b.y) overlaps.push({ first: a.id, second: b.id })
  }
  return overlaps
}
