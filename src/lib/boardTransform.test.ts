import { describe, expect, it, beforeEach } from 'vitest'
import { buildStickyElementsFromTransform, extractBoardTransform, sendBoardToApp } from './boardTransform'
import { listPendingTransforms } from '@purescience/platform-ui/suite'
import type { WhiteboardElementLike } from './whiteboardScene'

describe('PureWhiteboard Cross-App Transform Pipeline', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('clusters spatial sticky notes into structured sections and action items', async () => {
    const els = [
      { id: '1', x: 50, y: 40, text: 'Q1 Launch Goals', fontSize: 22, isDeleted: false },
      { id: '2', x: 50, y: 100, text: 'Ship editable PPTX export', fontSize: 16, isDeleted: false },
      { id: '3', x: 420, y: 40, text: 'Action: Send proof link by Fri', fontSize: 16, isDeleted: false },
    ] as unknown as WhiteboardElementLike[]

    const env = await sendBoardToApp('Strategy Jam', els, 'pureslides')
    expect(env.sections).toHaveLength(2)
    expect(env.sections[0]?.heading).toBe('Q1 Launch Goals')
    expect(env.actionItems?.length).toBeGreaterThan(0)
    expect(listPendingTransforms('pureslides')).toHaveLength(1)
  })

  it('turns incoming meeting TransformEnvelopes into Excalidraw text cards', () => {
    const env = extractBoardTransform('From Meet', [], 'purewhiteboard')
    const nodes = buildStickyElementsFromTransform({
      ...env,
      id: 'xf-1',
      createdAt: Date.now(),
      sections: [{ heading: 'Decisions', bullets: ['Approve design', 'Launch Tuesday'] }],
    })
    expect(nodes.length).toBe(3)
  })
})
