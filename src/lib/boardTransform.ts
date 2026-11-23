/**
 * PureWhiteboard Cross-App Transform Pipeline (Item 1).
 *
 * Converts messy brainstorming sticky notes, text nodes, and frames on the
 * Excalidraw scene directly into structured PureSlides decks, PureWriter briefs,
 * or PureTasks checklists — and turns incoming PureMeet/PureWriter envelopes
 * into neatly laid out sticky-note columns on the board!
 */
import {
  sendTransformEnvelope,
  type SuiteAppId,
  type TransformEnvelope,
} from '@purescience/platform-ui/suite'
import type { WhiteboardElementLike } from './whiteboardScene'

export function extractBoardTransform(
  title: string,
  elements: readonly WhiteboardElementLike[],
  targetApp: SuiteAppId,
): Omit<TransformEnvelope, 'id' | 'createdAt'> {
  const active = elements.filter(el => el && !el.isDeleted)
  const textItems: Array<{ text: string; x: number; y: number; fontSize: number }> = []
  for (const el of active) {
    const raw = el as Record<string, unknown>
    const text = typeof raw.text === 'string' ? raw.text.trim() : ''
    if (!text) continue
    textItems.push({
      text,
      x: typeof raw.x === 'number' ? raw.x : 0,
      y: typeof raw.y === 'number' ? raw.y : 0,
      fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 16,
    })
  }

  // Sort visually top-to-bottom, left-to-right into spatial columns (~360px wide buckets)
  textItems.sort((a, b) => Math.floor(a.x / 360) - Math.floor(b.x / 360) || a.y - b.y)

  const columns = new Map<number, typeof textItems>()
  for (const item of textItems) {
    const col = Math.floor(item.x / 360)
    const list = columns.get(col) ?? []
    list.push(item)
    columns.set(col, list)
  }

  const sections: TransformEnvelope['sections'] = []
  let idx = 1
  for (const items of columns.values()) {
    const headingItem = items[0]
    const rest = items.slice(1).map(i => i.text)
    if (headingItem) {
      sections.push({
        heading: headingItem.text.slice(0, 100),
        bullets: rest.length ? rest : [headingItem.text],
      })
      idx += 1
    }
  }

  if (sections.length === 0) {
    sections.push({
      heading: title || 'Whiteboard Brainstorm',
      bullets: [`Captured ${active.length} visual element(s) from PureWhiteboard.`],
    })
  }

  const actionItems = textItems
    .filter(i => /\b(todo|action|ship|build|send|review|owner|by\s+(mon|tue|wed|thu|fri))\b/i.test(i.text))
    .map(i => ({ text: i.text }))

  return {
    sourceApp: 'purewhiteboard',
    targetApp,
    title: title || 'Whiteboard Plan',
    subtitle: `Transformed from ${textItems.length} board note(s) across ${Math.max(1, idx - 1)} cluster(s)`,
    sections,
    ...(actionItems.length ? { actionItems } : {}),
  }
}

export async function sendBoardToApp(
  title: string,
  elements: readonly WhiteboardElementLike[],
  targetApp: SuiteAppId,
): Promise<TransformEnvelope> {
  return sendTransformEnvelope(extractBoardTransform(title, elements, targetApp))
}

/** Generate clean Excalidraw-compatible sticky/text card elements from an incoming TransformEnvelope. */
export function buildStickyElementsFromTransform(env: TransformEnvelope): WhiteboardElementLike[] {
  const created: WhiteboardElementLike[] = []
  const now = Date.now()
  let colIndex = 0
  const baseElements = [
    ...env.sections.map(s => ({ heading: s.heading, items: s.bullets?.length ? s.bullets : s.body ? [s.body] : [] })),
    ...(env.actionItems?.length
      ? [{ heading: 'Action Items', items: env.actionItems.map(a => `${a.text}${a.owner ? ` (${a.owner})` : ''}`) }]
      : []),
  ]

  for (const col of baseElements) {
    const x = 80 + colIndex * 300
    const yHead = 80
    const mkText = (id: string, text: string, tx: number, ty: number, fontSize: number): WhiteboardElementLike =>
      ({
        id,
        type: 'text',
        x: tx,
        y: ty,
        width: 260,
        height: 44,
        angle: 0,
        strokeColor: '#18181b',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 1_000_000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 1_000_000),
        isDeleted: false,
        boundElements: null,
        updated: now,
        link: null,
        locked: false,
        text,
        fontSize,
        fontFamily: 2,
        textAlign: 'left',
        verticalAlign: 'top',
        containerId: null,
        originalText: text,
        autoResize: true,
        lineHeight: 1.25,
      }) as unknown as WhiteboardElementLike

    created.push(mkText(`xf-h-${now}-${colIndex}`, col.heading, x, yHead, 20))
    col.items.slice(0, 8).forEach((item, rIdx) => {
      created.push(mkText(`xf-i-${now}-${colIndex}-${rIdx}`, `• ${item}`, x, yHead + 54 + rIdx * 48, 15))
    })
    colIndex += 1
  }
  return created
}
