import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

let nextElementId = 0

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY' },
  convertToExcalidrawElements: (
    specs: Array<Record<string, unknown>>,
    opts?: { regenerateIds: boolean },
  ): WhiteboardElementLike[] => {
    const labels = new Map<number, string>()
    const batch: WhiteboardElementLike[] = specs
      .map((spec, index) => {
        const { label, ...rest } = spec as Record<string, unknown> & {
          label?: { text?: string }
        }
        if (label?.text) labels.set(index, label.text)
        return rest as Record<string, unknown>
      })
      .map(spec => ({
        ...spec,
        id:
          opts?.regenerateIds === false && typeof spec.id === 'string'
            ? spec.id
            : `el-${(nextElementId += 1)}`,
        type: String(spec.type),
        x: Number(spec.x ?? 0),
        y: Number(spec.y ?? 0),
        width:
          typeof spec.width === 'number'
            ? spec.width
            : spec.type === 'text'
              ? Math.max(40, String(spec.text ?? '').length * 9)
              : 0,
        height:
          typeof spec.height === 'number'
            ? spec.height
            : spec.type === 'text'
              ? Math.max(24, Number(spec.fontSize ?? 20) * 1.25)
              : 0,
        text: typeof spec.text === 'string' ? spec.text : undefined,
        version: typeof spec.version === 'number' ? spec.version : 1,
      }))

    const out: WhiteboardElementLike[] = []
    const byId = new Map(batch.map(el => [el.id, el]))
    batch.forEach((element, index) => {
      out.push(element)
      const label = labels.get(index)
      if (label) {
        const isArrow = element.type === 'arrow'
        const lw = Math.max(30, label.length * 8)
        const text: WhiteboardElementLike = {
          id: `lbl-${(nextElementId += 1)}`,
          type: 'text',
          x: isArrow
            ? element.x + (element.width ?? 0) / 2 - lw / 2
            : element.x + 8,
          y: isArrow
            ? element.y + (element.height ?? 0) / 2 - 10
            : element.y + 8,
          width: isArrow ? lw : Math.min(element.width ?? 120, lw),
          height: 20,
          text: label,
          containerId: element.id,
        }
        element.boundElements = [
          ...(element.boundElements ?? []),
          { id: text.id, type: 'text' },
        ]
        out.push(text)
      }
      if (element.type === 'arrow') {
        for (const end of ['start', 'end'] as const) {
          const ref = (element as Record<string, { id?: string } | undefined>)[
            end
          ]
          const target = ref?.id ? byId.get(ref.id) : undefined
          if (!target) continue
          element[`${end}Binding`] = { elementId: target.id }
          target.boundElements = [
            ...(target.boundElements ?? []),
            { id: element.id, type: 'arrow' },
          ]
        }
      }
    })
    return out
  },
}))

import type {
  WhiteboardApiLike,
  WhiteboardElementLike,
} from '../lib/whiteboardScene'
import { WhiteboardToolError } from '../lib/whiteboardScene'
import { PUREWHITEBOARD_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  EXPOSED_TOOL_NAMES,
  PUREWHITEBOARD_AGENT_TOOL_NAMES,
  PUREWHITEBOARD_ALL_ATOMIC_TOOL_NAMES,
  PUREWHITEBOARD_CORE_TOOL_NAMES,
  PUREWHITEBOARD_EXTENDED_TOOL_NAMES,
  PUREWHITEBOARD_FUNCTION_NAMES,
  PUREWHITEBOARD_META_TOOL_NAMES,
} from './catalog'
import type { WhiteboardAgentContext } from './context'
import {
  PUREWHITEBOARD_OPERATIONS_REGISTRY,
  buildPureWhiteboardHandlers,
} from './operationsRegistry'

const PKG = '/Drafts/Architecture.whiteboard'

const invoke = (shortName: string, args: Record<string, unknown> = {}) => ({
  toolCallId: `tc_${shortName}`,
  shortName,
  arguments: args,
})

const RELEASE_VERBS = new Set([
  'send',
  'sends',
  'sending',
  'merge',
  'merges',
  'merging',
  'publish',
  'publishes',
  'publishing',
  'deposit',
  'deposits',
  'depositing',
  'deploy',
  'deploys',
  'deploying',
  'post',
  'posts',
  'posting',
])

function makeContext(
  initial: WhiteboardElementLike[] = [],
  appState: Record<string, unknown> = {},
) {
  let elements = [...initial]
  let updates = 0
  const save = vi.fn(async () => PKG)
  const create = vi.fn(async (title: string) => `/Drafts/${title}.whiteboard`)
  const open = vi.fn(async (path: string) => path)
  const exportPng = vi.fn(
    async (filename?: string) =>
      `${PKG}/assets/exports/${filename ?? 'board.png'}`,
  )

  const api: WhiteboardApiLike = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    updateScene: scene => {
      elements = [...scene.elements]
      updates += 1
    },
    scrollToContent: vi.fn(),
  }

  const ctx: WhiteboardAgentContext = {
    isReady: () => true,
    api,
    document: {
      packagePath: PKG,
      scenePath: `${PKG}/whiteboard.whiteboard.json`,
      persisted: true,
    },
    save,
    create,
    open,
    exportPng,
  }

  return {
    ctx,
    getElements: () => elements,
    getUpdates: () => updates,
    save,
    create,
    open,
    exportPng,
  }
}

describe('PureWhiteboard Operations Registry invariants', () => {
  it('exposes the exact 3-tier layout and syncs 1:1 with plugin.json and catalog.ts', () => {
    const manifest = JSON.parse(readFileSync('plugin.json', 'utf8')) as {
      app: {
        agents: {
          tools: Array<{
            name: string
            description: string
            risk: string
            requiresApproval: boolean
            inputSchema: Record<string, unknown>
          }>
        }
      }
    }

    const summary = PUREWHITEBOARD_OPERATIONS_REGISTRY.auditSummary()
    expect(summary).toEqual({
      appSlug: 'whiteboard',
      functions: 4,
      coreTools: 3,
      extendedTools: 8,
      metaTools: 3,
      totalExposed: 10,
      totalAtomicTools: 11,
      totalRegistered: 15,
      schemaReductionPercent: 9,
    })

    expect(PUREWHITEBOARD_OPERATIONS_REGISTRY.exposedToolNames).toEqual([
      ...EXPOSED_TOOL_NAMES,
    ])
    expect([...PUREWHITEBOARD_AGENT_TOOL_NAMES]).toEqual([
      ...EXPOSED_TOOL_NAMES,
    ])
    expect(
      PUREWHITEBOARD_OPERATIONS_REGISTRY.functions.map(f => f.name),
    ).toEqual([...PUREWHITEBOARD_FUNCTION_NAMES])
    expect(
      PUREWHITEBOARD_OPERATIONS_REGISTRY.coreTools.map(t => t.name),
    ).toEqual([...PUREWHITEBOARD_CORE_TOOL_NAMES])
    expect(PUREWHITEBOARD_OPERATIONS_REGISTRY.extendedToolNames).toEqual([
      ...PUREWHITEBOARD_EXTENDED_TOOL_NAMES,
    ])
    expect([...PUREWHITEBOARD_ALL_ATOMIC_TOOL_NAMES].sort()).toEqual(
      PUREWHITEBOARD_ATOMIC_TOOL_SCHEMAS.map(t => t.name).sort(),
    )
    expect(manifest.app.agents.tools).toEqual(
      PUREWHITEBOARD_OPERATIONS_REGISTRY.manifestTools,
    )
    expect(PUREWHITEBOARD_META_TOOL_NAMES).toEqual([
      'discoverAppTools',
      'callExtendedReadTool',
      'callExtendedTool',
    ])
  })

  it('satisfies manifest rules: descriptions >= 80 chars, explicit booleans, no release verbs, context-first on path args', () => {
    for (const tool of PUREWHITEBOARD_OPERATIONS_REGISTRY.manifestTools) {
      const normalized = tool.description.trim().replace(/\s+/g, ' ')
      expect(
        normalized.length,
        `${tool.name} description too short (${normalized.length})`,
      ).toBeGreaterThanOrEqual(80)
      expect(typeof tool.requiresApproval).toBe('boolean')

      const nameFirst =
        tool.name
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      const descFirst =
        normalized
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      expect(
        RELEASE_VERBS.has(nameFirst),
        `${tool.name} starts with release verb`,
      ).toBe(false)
      expect(
        RELEASE_VERBS.has(descFirst),
        `${tool.name} description starts with release verb`,
      ).toBe(false)

      const props = (tool.inputSchema.properties ?? {}) as Record<
        string,
        unknown
      >
      if ('packagePath' in props || 'path' in props) {
        expect(normalized).toMatch(/call getWhiteboardContext first/i)
      }
    }

    for (const fn of PUREWHITEBOARD_OPERATIONS_REGISTRY.functions) {
      expect(fn.name.startsWith('fn_')).toBe(true)
      const afterPrefix =
        fn.name
          .slice(3)
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      expect(RELEASE_VERBS.has(afterPrefix)).toBe(false)
    }

    for (const atomic of PUREWHITEBOARD_ATOMIC_TOOL_SCHEMAS) {
      const normalized = atomic.description.trim().replace(/\s+/g, ' ')
      expect(
        normalized.length,
        `atomic ${atomic.name} description too short (${normalized.length})`,
      ).toBeGreaterThanOrEqual(80)
      expect(typeof atomic.requiresApproval).toBe('boolean')
    }
  })

  it('builds one handler per exposed tool and none for extended tools directly', () => {
    const { ctx } = makeContext()
    const handlers = buildPureWhiteboardHandlers(() => ctx)
    expect(Object.keys(handlers).sort()).toEqual([...EXPOSED_TOOL_NAMES].sort())
    for (const ext of PUREWHITEBOARD_EXTENDED_TOOL_NAMES) {
      expect(handlers[ext]).toBeUndefined()
    }
  })
})

describe('Universal escape-hatch meta-tools', () => {
  it('discoverAppTools searches extended tools by query, category, names, and includeFunctions', async () => {
    const { ctx } = makeContext()
    const handlers = buildPureWhiteboardHandlers(() => ctx)

    const byQuery = JSON.parse(
      (
        await handlers.discoverAppTools!(
          invoke('discoverAppTools', { query: 'arrow bound connect' }),
        )
      ).content,
    )
    expect(byQuery.appSlug).toBe('whiteboard')
    expect(
      byQuery.operations.some((o: { name: string }) => o.name === 'connect'),
    ).toBe(true)

    const byCategory = JSON.parse(
      (
        await handlers.discoverAppTools!(
          invoke('discoverAppTools', { category: 'document' }),
        )
      ).content,
    )
    expect(
      byCategory.operations.map((o: { name: string }) => o.name).sort(),
    ).toEqual(['clearWhiteboard', 'openWhiteboard', 'saveWhiteboard'])

    const byNames = JSON.parse(
      (
        await handlers.discoverAppTools!(
          invoke('discoverAppTools', {
            names: ['removeElement', 'openWhiteboard', 'ghostTool'],
          }),
        )
      ).content,
    )
    expect(byNames.mode).toBe('describe')
    expect(byNames.operations[0]).toMatchObject({
      name: 'removeElement',
      found: true,
      exposure: 'extended',
      invokeVia: 'callExtendedTool',
      requiresConfirmDestructive: true,
    })
    expect(byNames.operations[1]).toMatchObject({
      name: 'openWhiteboard',
      found: true,
      exposure: 'extended',
      invokeVia: 'callExtendedReadTool',
    })
    expect(byNames.operations[2]).toMatchObject({
      name: 'ghostTool',
      found: false,
    })

    const withFunctions = JSON.parse(
      (
        await handlers.discoverAppTools!(
          invoke('discoverAppTools', {
            query: 'sticky brainstorming',
            includeFunctions: true,
          }),
        )
      ).content,
    )
    expect(
      withFunctions.operations.some(
        (o: { name: string; invokeVia: string }) =>
          o.name === 'fn_createStickyBoard' && o.invokeVia === 'direct',
      ),
    ).toBe(true)
  })

  it('callExtendedReadTool routes openWhiteboard and refuses mutating, direct, and unknown tools', async () => {
    const { ctx, open } = makeContext()
    const handlers = buildPureWhiteboardHandlers(() => ctx)

    const opened = JSON.parse(
      (
        await handlers.callExtendedReadTool!(
          invoke('callExtendedReadTool', {
            tool: 'openWhiteboard',
            arguments: { path: '/Drafts/Existing.whiteboard' },
          }),
        )
      ).content,
    )
    expect(opened).toEqual({ packagePath: '/Drafts/Existing.whiteboard' })
    expect(open).toHaveBeenCalledWith('/Drafts/Existing.whiteboard')

    await expect(
      handlers.callExtendedReadTool!(
        invoke('callExtendedReadTool', {
          tool: 'addShape',
          arguments: { shape: 'rectangle', packagePath: PKG },
        }),
      ),
    ).rejects.toThrow(/cannot run through callExtendedReadTool/)

    await expect(
      handlers.callExtendedReadTool!(
        invoke('callExtendedReadTool', { tool: 'getWhiteboardContext' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    await expect(
      handlers.callExtendedReadTool!(
        invoke('callExtendedReadTool', { tool: 'nonExistent' }),
      ),
    ).rejects.toThrow(/Unknown extended tool/)
  })

  it('callExtendedTool routes mutating extended tools, enforces packagePath + confirmDestructive, and refuses read/direct/unknown', async () => {
    const { ctx, getElements, save } = makeContext()
    const beforeInvoke = vi.fn()
    const recordOperation = vi.fn()
    const handlers = buildPureWhiteboardHandlers(() => ctx, {
      beforeInvoke,
      recordOperation,
    })

    // Wrong packagePath is rejected before mutation
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', {
          tool: 'addShape',
          arguments: {
            shape: 'rectangle',
            label: 'Gateway',
            packagePath: '/Drafts/Wrong.whiteboard',
          },
        }),
      ),
    ).rejects.toThrow(/whiteboard changed/)
    expect(save).not.toHaveBeenCalled()

    // Valid addShape mutates and saves
    const added = await handlers.callExtendedTool!(
      invoke('callExtendedTool', {
        tool: 'addShape',
        arguments: {
          shape: 'rectangle',
          label: 'Gateway',
          packagePath: PKG,
        },
      }),
    )
    expect(added.content).toContain(`Saved whiteboard package: ${PKG}`)
    expect(save).toHaveBeenCalledTimes(1)
    expect(beforeInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'addShape',
        opClass: 'tool',
        risk: 'write',
        viaExtended: true,
      }),
    )
    expect(recordOperation).toHaveBeenCalledWith(
      ctx,
      'extended.addShape',
      expect.stringContaining('addShape'),
    )

    const shapeId = getElements().find(el => el.type === 'rectangle')!.id

    // Destructive removeElement refuses without confirmDestructive: true
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', {
          tool: 'removeElement',
          arguments: { id: shapeId, packagePath: PKG },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive: true/)

    // Destructive removeElement succeeds with confirmDestructive: true
    const removed = await handlers.callExtendedTool!(
      invoke('callExtendedTool', {
        tool: 'removeElement',
        arguments: { id: shapeId, packagePath: PKG },
        confirmDestructive: true,
      }),
    )
    expect(removed.content).toContain(`Removed element "${shapeId}"`)
    expect(getElements()).toHaveLength(0)

    // Refuses read-only extended tool
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', {
          tool: 'openWhiteboard',
          arguments: { path: PKG },
        }),
      ),
    ).rejects.toThrow(/read-only/)

    // Refuses directly exposed tool
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', {
          tool: 'createWhiteboard',
          arguments: { title: 'Test' },
        }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    // Refuses unknown tool
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', { tool: 'missingTool' }),
      ),
    ).rejects.toThrow(/Unknown extended tool/)
  })
})

describe('Composite App Functions (fn_*)', () => {
  it('fn_buildDiagram builds a complete layered flowchart in 1 atomic commit + save, and connects to existing elements', async () => {
    const { ctx, getElements, getUpdates, save } = makeContext()
    const handlers = buildPureWhiteboardHandlers(() => ctx)

    const env = JSON.parse(
      (
        await handlers.fn_buildDiagram!(
          invoke('fn_buildDiagram', {
            packagePath: PKG,
            title: 'Auth Flow',
            layout: 'left-to-right',
            nodes: [
              { key: 'start', label: 'Client Login', shape: 'ellipse', backgroundColor: '#d0ebff' },
              { key: 'check', label: 'Valid Token?', shape: 'diamond', backgroundColor: '#fff3bf' },
              { key: 'ok', label: 'Dashboard', shape: 'rectangle', backgroundColor: '#d3f9d8' },
              { key: 'err', label: '401 Error', shape: 'rectangle', backgroundColor: '#ffe3e3' },
            ],
            edges: [
              { from: 'start', to: 'check', label: 'POST /auth' },
              { from: 'check', to: 'ok', label: 'Yes' },
              { from: 'check', to: 'err', label: 'No' },
            ],
          }),
        )
      ).content,
    )

    expect(env).toMatchObject({
      ok: true,
      opClass: 'function',
      function: 'fn_buildDiagram',
    })
    expect(getUpdates()).toBe(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(env.data.savedPackagePath).toBe(PKG)
    expect(env.data.titleId).toBeTruthy()
    expect(env.data.createdNodeIds).toHaveLength(4)
    expect(env.data.createdArrowIds).toHaveLength(3)
    expect(env.data.textOverlaps).toEqual([])

    // Verify layered left-to-right ordering: start.x < check.x < ok.x
    const byId = new Map(getElements().map(e => [e.id, e]))
    const startEl = byId.get(env.data.keyToId.start)!
    const checkEl = byId.get(env.data.keyToId.check)!
    const okEl = byId.get(env.data.keyToId.ok)!
    const errEl = byId.get(env.data.keyToId.err)!
    expect(startEl.x).toBeLessThan(checkEl.x)
    expect(checkEl.x).toBeLessThan(okEl.x)
    expect(okEl.y).not.toBe(errEl.y)

    // Verify connecting a new top-to-bottom diagram node to an existing board element
    const ext = JSON.parse(
      (
        await handlers.fn_buildDiagram!(
          invoke('fn_buildDiagram', {
            packagePath: PKG,
            layout: 'top-to-bottom',
            nodes: [{ key: 'audit', label: 'Audit Log' }],
            edges: [{ from: env.data.keyToId.ok, to: 'audit', label: 'record' }],
          }),
        )
      ).content,
    )
    expect(ext.data.createdNodeIds).toHaveLength(1)
    expect(ext.data.createdArrowIds).toHaveLength(1)
    const arrow = getElements().find(e => e.id === ext.data.createdArrowIds[0])!
    expect(arrow.startBinding).toEqual({ elementId: env.data.keyToId.ok })
    expect(arrow.endBinding).toEqual({ elementId: ext.data.keyToId.audit })

    // Validation errors
    await expect(
      handlers.fn_buildDiagram!(
        invoke('fn_buildDiagram', { packagePath: PKG, nodes: [] }),
      ),
    ).rejects.toThrow(WhiteboardToolError)
    await expect(
      handlers.fn_buildDiagram!(
        invoke('fn_buildDiagram', {
          packagePath: PKG,
          nodes: [
            { key: 'dup', label: 'One' },
            { key: 'dup', label: 'Two' },
          ],
        }),
      ),
    ).rejects.toThrow(/Duplicate node key/)
  })

  it('fn_createStickyBoard creates color-coded themed columns and cluster grids in 1 atomic commit + save', async () => {
    const { ctx, getElements, getUpdates, save } = makeContext()
    const handlers = buildPureWhiteboardHandlers(() => ctx)

    const env = JSON.parse(
      (
        await handlers.fn_createStickyBoard!(
          invoke('fn_createStickyBoard', {
            packagePath: PKG,
            boardTitle: 'Sprint 14 Retro',
            arrangement: 'columns',
            groups: [
              {
                title: 'Went Well',
                notes: ['Zero-downtime deploy', 'Fast review turnaround'],
              },
              {
                title: 'Improve',
                color: '#ffe3e3',
                notes: [{ text: 'Flaky integration test', strokeColor: '#c92a2a' }],
              },
            ],
          }),
        )
      ).content,
    )

    expect(env).toMatchObject({
      ok: true,
      opClass: 'function',
      function: 'fn_createStickyBoard',
    })
    expect(getUpdates()).toBe(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(env.data.totalNotes).toBe(3)
    expect(env.data.groups).toHaveLength(2)
    expect(env.data.groups[0].noteIds).toHaveLength(2)
    expect(env.data.groups[1].noteIds).toHaveLength(1)
    expect(env.data.textOverlaps).toEqual([])

    const byId = new Map(getElements().map(e => [e.id, e]))
    const header0 = byId.get(env.data.groups[0].headerId)!
    const header1 = byId.get(env.data.groups[1].headerId)!
    expect(header1.x).toBeGreaterThan(header0.x + (header0.width ?? 0))
    const improveNote = byId.get(env.data.groups[1].noteIds[0])!
    expect(improveNote.backgroundColor).toBe('#ffe3e3')
    expect(improveNote.strokeColor).toBe('#c92a2a')

    // Grid arrangement works cleanly too
    const grid = JSON.parse(
      (
        await handlers.fn_createStickyBoard!(
          invoke('fn_createStickyBoard', {
            packagePath: PKG,
            arrangement: 'grid',
            groups: [
              { title: 'A', notes: ['a1'] },
              { title: 'B', notes: ['b1'] },
              { title: 'C', notes: ['c1'] },
              { title: 'D', notes: ['d1'] },
            ],
          }),
        )
      ).content,
    )
    expect(grid.data.arrangement).toBe('grid')
    expect(grid.data.totalNotes).toBe(4)
  })

  it('fn_analyzeBoard extracts graph topology, decision branches, spatial clusters, palette, and export readiness', async () => {
    const { ctx, save } = makeContext([], { selectedElementIds: {} })
    const handlers = buildPureWhiteboardHandlers(() => ctx)

    // Build a flow diagram on the left
    const diag = JSON.parse(
      (
        await handlers.fn_buildDiagram!(
          invoke('fn_buildDiagram', {
            packagePath: PKG,
            nodes: [
              { key: 'in', label: 'Ingest', shape: 'ellipse', backgroundColor: '#d0ebff' },
              { key: 'dec', label: 'Valid?', shape: 'diamond', backgroundColor: '#fff3bf' },
              { key: 'out', label: 'Store', shape: 'rectangle', backgroundColor: '#d3f9d8' },
            ],
            edges: [
              { from: 'in', to: 'dec' },
              { from: 'dec', to: 'out', label: 'Yes' },
            ],
            origin: { x: 100, y: 100 },
          }),
        )
      ).content,
    )

    // Place a far-away isolated note so spatial clustering produces 2 clusters
    await handlers.callExtendedTool!(
      invoke('callExtendedTool', {
        tool: 'addText',
        arguments: {
          text: 'Parking Lot Idea',
          x: 2000,
          y: 1200,
          packagePath: PKG,
        },
      }),
    )

    const savesBefore = save.mock.calls.length
    const env = JSON.parse(
      (
        await handlers.fn_analyzeBoard!(
          invoke('fn_analyzeBoard', { includeElements: true }),
        )
      ).content,
    )

    expect(env.ok).toBe(true)
    expect(save.mock.calls.length).toBe(savesBefore) // read-only: zero saves
    expect(env.data.document.packagePath).toBe(PKG)
    expect(env.data.graph.edgeCount).toBe(2)
    expect(env.data.graph.entryNodes.map((n: { id: string }) => n.id)).toEqual([
      diag.data.keyToId.in,
    ])
    expect(env.data.graph.terminalNodes.map((n: { id: string }) => n.id)).toEqual([
      diag.data.keyToId.out,
    ])
    expect(env.data.graph.decisionNodes).toEqual([
      expect.objectContaining({
        id: diag.data.keyToId.dec,
        label: 'Valid?',
        branches: [
          expect.objectContaining({
            toId: diag.data.keyToId.out,
            label: 'Yes',
          }),
        ],
      }),
    ])
    expect(env.data.graph.isolatedNodes).toHaveLength(1)
    expect(env.data.spatialClusters).toHaveLength(2)
    expect(env.data.palette.fills.length).toBeGreaterThanOrEqual(3)
    expect(env.data.exportReadiness).toMatchObject({
      ready: true,
      isEmpty: false,
      textOverlapCount: 0,
    })
    expect(env.data.elements.length).toBe(6)
  })

  it('fn_refineBoard batch-restyles, batch-connects, adds annotations, and resolves overlapping free-text labels verbatim', async () => {
    const { ctx, getElements, save } = makeContext([
      {
        id: 'box-1',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 180,
        height: 80,
        version: 1,
      },
      {
        id: 'box-2',
        type: 'rectangle',
        x: 420,
        y: 100,
        width: 180,
        height: 80,
        version: 1,
      },
      {
        id: 'txt-1',
        type: 'text',
        x: 100,
        y: 260,
        width: 160,
        height: 24,
        text: 'Dr. Elena Morales, PhD',
        version: 1,
      },
      {
        id: 'txt-2',
        type: 'text',
        x: 110,
        y: 265,
        width: 140,
        height: 24,
        text: 'Owner: 2026-11-23',
        version: 1,
      },
    ])
    const handlers = buildPureWhiteboardHandlers(() => ctx)

    const env = JSON.parse(
      (
        await handlers.fn_refineBoard!(
          invoke('fn_refineBoard', {
            packagePath: PKG,
            styles: [
              {
                ids: ['box-1', 'box-2'],
                backgroundColor: '#d0ebff',
                strokeWidth: 3,
                opacity: 90,
              },
            ],
            connections: [{ fromId: 'box-1', toId: 'box-2', label: 'sync' }],
            annotations: [{ text: 'Phase 2', x: 100, y: 380, fontSize: 18 }],
            resolveTextOverlaps: true,
          }),
        )
      ).content,
    )

    expect(env.ok).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(env.data.styledIds).toEqual(['box-1', 'box-2'])
    expect(env.data.createdArrowIds).toHaveLength(1)
    expect(env.data.createdAnnotationIds).toHaveLength(1)
    expect(env.data.repositionedTextIds).toEqual(['txt-2'])
    expect(env.data.remainingTextOverlaps).toEqual([])

    const byId = new Map(getElements().map(e => [e.id, e]))
    expect(byId.get('box-1')).toMatchObject({
      backgroundColor: '#d0ebff',
      strokeWidth: 3,
      opacity: 90,
      version: 2,
    })
    // Verbatim owner text preserved intact
    expect(byId.get('txt-1')?.text).toBe('Dr. Elena Morales, PhD')
    expect(byId.get('txt-2')?.text).toBe('Owner: 2026-11-23')
    expect(byId.get('txt-2')!.y).toBeGreaterThanOrEqual(260 + 24 + 12)

    // Calling resolveTextOverlaps when no overlaps remain is a clean non-mutating check
    const savesAfterFirst = save.mock.calls.length
    const noop = JSON.parse(
      (
        await handlers.fn_refineBoard!(
          invoke('fn_refineBoard', {
            packagePath: PKG,
            resolveTextOverlaps: true,
          }),
        )
      ).content,
    )
    expect(noop.data.repositionedTextIds).toEqual([])
    expect(save.mock.calls.length).toBe(savesAfterFirst)

    // Empty refinement request refuses cleanly
    await expect(
      handlers.fn_refineBoard!(
        invoke('fn_refineBoard', { packagePath: PKG }),
      ),
    ).rejects.toThrow(/Nothing to refine/)
  })
})
