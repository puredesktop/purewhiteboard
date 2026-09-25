import { describe, expect, it } from 'vitest'
import manifest from '../../plugin.json'
import { PUREWHITEBOARD_AGENT_TOOL_NAMES } from './catalog'

describe('purewhiteboard agent catalog', () => {
  it('matches plugin.json tool declarations', () => {
    expect(manifest.app.agents.tools.map(tool => tool.name)).toEqual([
      ...PUREWHITEBOARD_AGENT_TOOL_NAMES,
    ])
  })
})
