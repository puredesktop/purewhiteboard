import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import { assertWhiteboardTarget } from '../lib/agentDocumentIdentity'
import { runWhenCanvasReady } from '../lib/agentReadiness'
import { textOverlaps } from '../lib/textOverlaps'
import {
  BINDABLE_TYPES,
  SHAPES,
  WhiteboardToolError,
  commit,
  createdElements,
  getWhiteboardContext,
  liveElements,
  nextFreePosition,
  touched,
  type WhiteboardApiLike,
  type WhiteboardElementLike,
  type WhiteboardShape,
} from '../lib/whiteboardScene'
import type { WhiteboardAgentContext } from './context'

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

interface StickyPaletteEntry {
  headerBg: string
  noteBg: string
  stroke: string
}

const STICKY_PALETTE: readonly StickyPaletteEntry[] = [
  { headerBg: '#ffec99', noteBg: '#fff9db', stroke: '#e67700' },
  { headerBg: '#a5d8ff', noteBg: '#e7f5ff', stroke: '#1971c2' },
  { headerBg: '#b2f2bb', noteBg: '#ebfbee', stroke: '#2f9e44' },
  { headerBg: '#ffc9c9', noteBg: '#fff5f5', stroke: '#e03131' },
  { headerBg: '#d0bfff', noteBg: '#f3f0ff', stroke: '#6741d9' },
  { headerBg: '#ffd8a8', noteBg: '#fff4e6', stroke: '#d9480f' },
]

let syntheticCounter = 0

function makeUniqueId(used: Set<string>, prefix = 'wb'): string {
  while (true) {
    const suffix =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : `${Date.now().toString(36)}_${(++syntheticCounter).toString(36)}`
    const candidate = `${prefix}_${suffix}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function ensureApi(ctx: WhiteboardAgentContext): WhiteboardApiLike {
  if (!ctx.api) {
    throw new WhiteboardToolError('Whiteboard canvas is not ready yet.')
  }
  return ctx.api
}

function computeBounds(
  elements: readonly { x: number; y: number; width?: number; height?: number }[],
): Bounds | null {
  if (!elements.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    const x1 = el.x
    const y1 = el.y
    const x2 = el.x + Math.max(0, el.width ?? 0)
    const y2 = el.y + Math.max(0, el.height ?? 0)
    if (x1 < minX) minX = x1
    if (y1 < minY) minY = y1
    if (x2 > maxX) maxX = x2
    if (y2 > maxY) maxY = y2
  }
  const rMinX = Math.round(minX)
  const rMinY = Math.round(minY)
  const rMaxX = Math.round(maxX)
  const rMaxY = Math.round(maxY)
  return {
    minX: rMinX,
    minY: rMinY,
    maxX: rMaxX,
    maxY: rMaxY,
    width: Math.max(0, rMaxX - rMinX),
    height: Math.max(0, rMaxY - rMinY),
  }
}

function estimateNodeSize(
  label: string,
  shape: WhiteboardShape,
  explicitWidth?: number,
  explicitHeight?: number,
): { width: number; height: number } {
  const lines = label.split(/\r?\n/)
  const longest = Math.max(1, ...lines.map(line => line.length))
  const wrappedLines = lines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / 28)),
    0,
  )
  const baseWidth = Math.max(180, Math.min(340, longest * 9.5 + 48))
  const baseHeight = Math.max(84, wrappedLines * 26 + 38)
  const scale = shape === 'diamond' ? 1.25 : 1
  const width = Math.round(
    explicitWidth !== undefined
      ? Math.max(40, explicitWidth)
      : baseWidth * scale,
  )
  const height = Math.round(
    explicitHeight !== undefined
      ? Math.max(40, explicitHeight)
      : baseHeight * scale,
  )
  return { width, height }
}

function estimateStickyHeight(text: string, width: number): number {
  const charsPerLine = Math.max(12, Math.floor((width - 32) / 9.5))
  const lines = text.split(/\r?\n/).reduce((sum, raw) => {
    const trimmed = raw.trim()
    return sum + Math.max(1, Math.ceil(trimmed.length / charsPerLine))
  }, 0)
  return Math.max(88, Math.round(lines * 24 + 36))
}

function arrowGeometry(
  from: { x: number; y: number; width?: number; height?: number },
  to: { x: number; y: number; width?: number; height?: number },
): { x: number; y: number; width: number; height: number } {
  const fw = from.width ?? 0
  const fh = from.height ?? 0
  const tw = to.width ?? 0
  const th = to.height ?? 0
  const fcx = from.x + fw / 2
  const fcy = from.y + fh / 2
  const tcx = to.x + tw / 2
  const tcy = to.y + th / 2
  const dx = tcx - fcx
  const dy = tcy - fcy

  let x1: number
  let y1: number
  let x2: number
  let y2: number
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      x1 = from.x + fw
      y1 = fcy
      x2 = to.x
      y2 = tcy
    } else {
      x1 = from.x
      y1 = fcy
      x2 = to.x + tw
      y2 = tcy
    }
  } else if (dy >= 0) {
    x1 = fcx
    y1 = from.y + fh
    x2 = tcx
    y2 = to.y
  } else {
    x1 = fcx
    y1 = from.y
    x2 = tcx
    y2 = to.y + th
  }
  return {
    x: Math.round(x1),
    y: Math.round(y1),
    width: Math.round(x2 - x1),
    height: Math.round(y2 - y1),
  }
}

function boxesClose(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap: number,
): boolean {
  return (
    a.x - gap <= b.x + b.width &&
    a.x + a.width + gap >= b.x &&
    a.y - gap <= b.y + b.height &&
    a.y + a.height + gap >= b.y
  )
}

function resolveOrigin(
  existing: readonly WhiteboardElementLike[],
  originArg: unknown,
): { x: number; y: number } {
  const fallback = nextFreePosition(existing)
  if (!isPlainObject(originArg)) return fallback
  return {
    x: Math.round(finiteNumber(originArg.x, fallback.x)),
    y: Math.round(finiteNumber(originArg.y, fallback.y)),
  }
}

// ---------------------------------------------------------------------------
// 1. fn_analyzeBoard (read)
// ---------------------------------------------------------------------------
export const fn_analyzeBoard: AppFunctionDefinition<WhiteboardAgentContext> =
  defineAppFunction<WhiteboardAgentContext>({
    name: 'fn_analyzeBoard',
    category: 'canvas',
    risk: 'read',
    requiresApproval: false,
    replaces: ['getWhiteboardContext'],
    description:
      'Inspect the current whiteboard in one structured pass: returns document.packagePath, element counts, bounding box, next free placement origin, directed graph topology (nodes, bound edges, entry/terminal/decision/isolated nodes, unbound arrows), spatial proximity clusters, active color palette, and export-readiness text-overlap diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        clusterGapPx: {
          type: 'number',
          description:
            'Proximity threshold in scene units used to group nearby elements into spatial clusters (default 120).',
        },
        includeElements: {
          type: 'boolean',
          description:
            'Include the full addressable element list alongside the structured graph and cluster summaries (default false).',
        },
      },
    },
    run: async (ctx, args) => {
      const readyCtx = await runWhenCanvasReady(() => ctx)
      const api = ensureApi(readyCtx)
      const snapshot = getWhiteboardContext(api)
      const raw = liveElements(api)
      const overlaps = textOverlaps(raw)
      const clusterGap = Math.max(0, finiteNumber(args.clusterGapPx, 120))
      const includeElements = args.includeElements === true

      const countsByType: Record<string, number> = {
        rectangle: 0,
        ellipse: 0,
        diamond: 0,
        text: 0,
        arrow: 0,
        other: 0,
      }
      for (const el of snapshot.elements) {
        if (el.type in countsByType) {
          countsByType[el.type] += 1
        } else {
          countsByType.other += 1
        }
      }

      const nodes = snapshot.elements.filter(el => el.type !== 'arrow')
      const nodeById = new Map(nodes.map(node => [node.id, node]))
      const inDegree = new Map<string, number>(nodes.map(n => [n.id, 0]))
      const outDegree = new Map<string, number>(nodes.map(n => [n.id, 0]))

      const edges: Array<{
        id: string
        fromId: string
        fromLabel?: string
        toId: string
        toLabel?: string
        label?: string
      }> = []
      const unboundArrows: Array<{
        id: string
        fromId?: string
        toId?: string
        label?: string
      }> = []

      for (const el of snapshot.elements) {
        if (el.type !== 'arrow') continue
        if (el.from && el.to && nodeById.has(el.from) && nodeById.has(el.to)) {
          edges.push({
            id: el.id,
            fromId: el.from,
            ...(nodeById.get(el.from)?.text
              ? { fromLabel: nodeById.get(el.from)!.text }
              : {}),
            toId: el.to,
            ...(nodeById.get(el.to)?.text
              ? { toLabel: nodeById.get(el.to)!.text }
              : {}),
            ...(el.text ? { label: el.text } : {}),
          })
          outDegree.set(el.from, (outDegree.get(el.from) ?? 0) + 1)
          inDegree.set(el.to, (inDegree.get(el.to) ?? 0) + 1)
        } else {
          unboundArrows.push({
            id: el.id,
            ...(el.from ? { fromId: el.from } : {}),
            ...(el.to ? { toId: el.to } : {}),
            ...(el.text ? { label: el.text } : {}),
          })
        }
      }

      const nodeBrief = (id: string) => {
        const n = nodeById.get(id)!
        return {
          id: n.id,
          type: n.type,
          ...(n.text ? { label: n.text } : {}),
          inDegree: inDegree.get(id) ?? 0,
          outDegree: outDegree.get(id) ?? 0,
        }
      }

      const entryNodes = nodes
        .filter(n => (inDegree.get(n.id) ?? 0) === 0 && (outDegree.get(n.id) ?? 0) > 0)
        .map(n => nodeBrief(n.id))
      const terminalNodes = nodes
        .filter(n => (inDegree.get(n.id) ?? 0) > 0 && (outDegree.get(n.id) ?? 0) === 0)
        .map(n => nodeBrief(n.id))
      const isolatedNodes = nodes
        .filter(n => (inDegree.get(n.id) ?? 0) === 0 && (outDegree.get(n.id) ?? 0) === 0)
        .map(n => nodeBrief(n.id))
      const decisionNodes = nodes
        .filter(n => n.type === 'diamond')
        .map(n => ({
          id: n.id,
          ...(n.text ? { label: n.text } : {}),
          branches: edges
            .filter(edge => edge.fromId === n.id)
            .map(edge => ({
              toId: edge.toId,
              ...(edge.toLabel ? { toLabel: edge.toLabel } : {}),
              ...(edge.label ? { label: edge.label } : {}),
            })),
        }))

      // Union-find spatial + connectivity clustering
      const parent = new Map<string, string>(nodes.map(n => [n.id, n.id]))
      const find = (id: string): string => {
        let cur = id
        while (parent.get(cur) !== cur) {
          cur = parent.get(cur)!
        }
        let walk = id
        while (parent.get(walk) !== cur) {
          const next = parent.get(walk)!
          parent.set(walk, cur)
          walk = next
        }
        return cur
      }
      const unite = (a: string, b: string) => {
        const ra = find(a)
        const rb = find(b)
        if (ra !== rb) parent.set(rb, ra)
      }

      for (const edge of edges) {
        unite(edge.fromId, edge.toId)
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          if (boxesClose(nodes[i], nodes[j], clusterGap)) {
            unite(nodes[i].id, nodes[j].id)
          }
        }
      }

      const clusterMap = new Map<string, typeof nodes>()
      for (const n of nodes) {
        const root = find(n.id)
        const list = clusterMap.get(root) ?? []
        list.push(n)
        clusterMap.set(root, list)
      }

      const spatialClusters = [...clusterMap.values()]
        .map(members => {
          const bounds = computeBounds(members)!
          return {
            elementCount: members.length,
            bounds,
            labels: members
              .map(m => m.text)
              .filter((t): t is string => Boolean(t)),
            elementIds: members.map(m => m.id),
          }
        })
        .sort(
          (a, b) =>
            a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX,
        )
        .map((cluster, index) => ({ clusterIndex: index + 1, ...cluster }))

      // Palette histogram
      const fillCounts = new Map<string, number>()
      const strokeCounts = new Map<string, number>()
      for (const el of snapshot.elements) {
        if (el.backgroundColor) {
          fillCounts.set(
            el.backgroundColor,
            (fillCounts.get(el.backgroundColor) ?? 0) + 1,
          )
        }
        if (el.strokeColor) {
          strokeCounts.set(
            el.strokeColor,
            (strokeCounts.get(el.strokeColor) ?? 0) + 1,
          )
        }
      }
      const sortPalette = (m: Map<string, number>) =>
        [...m.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([color, count]) => ({ color, count }))

      const rawById = new Map(raw.map(el => [el.id, el]))
      const enrichedOverlaps = overlaps.map(pair => {
        const firstEl = rawById.get(pair.first)
        const secondEl = rawById.get(pair.second)
        return {
          first: pair.first,
          firstText: firstEl?.text ?? '',
          firstIsBoundLabel: Boolean(firstEl?.containerId),
          second: pair.second,
          secondText: secondEl?.text ?? '',
          secondIsBoundLabel: Boolean(secondEl?.containerId),
        }
      })

      const bounds = computeBounds(raw)
      const nextFreeOrigin = nextFreePosition(raw)
      const exportReady = raw.length > 0 && overlaps.length === 0

      const summary =
        snapshot.elementCount === 0
          ? 'Board is empty (0 elements); ready for a new diagram or sticky board.'
          : `Analyzed board (${snapshot.elementCount} element${snapshot.elementCount === 1 ? '' : 's'}, ${edges.length} bound edge${edges.length === 1 ? '' : 's'}, ${spatialClusters.length} cluster${spatialClusters.length === 1 ? '' : 's'}); export ${exportReady ? 'ready' : `blocked by ${overlaps.length} text overlap${overlaps.length === 1 ? '' : 's'}`}.`

      return {
        summary,
        mutated: false,
        data: {
          document: readyCtx.document,
          overview: {
            elementCount: snapshot.elementCount,
            truncated: snapshot.truncated,
            countsByType,
            selectedElementIds: snapshot.selectedElementIds,
            bounds,
            nextFreeOrigin,
          },
          graph: {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            edges,
            entryNodes,
            terminalNodes,
            decisionNodes,
            isolatedNodes,
            unboundArrows,
          },
          spatialClusters,
          palette: {
            fills: sortPalette(fillCounts),
            strokes: sortPalette(strokeCounts),
          },
          exportReadiness: {
            ready: exportReady,
            isEmpty: raw.length === 0,
            textOverlapCount: overlaps.length,
            textOverlaps: enrichedOverlaps,
          },
          ...(includeElements ? { elements: snapshot.elements } : {}),
        },
      }
    },
  })

// ---------------------------------------------------------------------------
// 2. fn_buildDiagram (write)
// ---------------------------------------------------------------------------
interface ParsedDiagramNode {
  key: string
  id: string
  label: string
  shape: WhiteboardShape
  backgroundColor: string
  strokeColor: string
  width: number
  height: number
  lane?: string
  x: number
  y: number
}

interface ParsedDiagramEdge {
  from: string
  to: string
  label?: string
}

export const fn_buildDiagram: AppFunctionDefinition<WhiteboardAgentContext> =
  defineAppFunction<WhiteboardAgentContext>({
    name: 'fn_buildDiagram',
    category: 'diagramming',
    risk: 'write',
    requiresApproval: false,
    replaces: ['addShape', 'addText', 'connect'],
    description:
      'Build a complete auto-laid-out diagram, flowchart, or architecture sketch (optional title, labelled shapes, and bound labelled arrows) in one atomic undoable step and save it. Call getWhiteboardContext first to inspect the board and obtain document.packagePath. Automatically places the diagram clear of existing content with collision-free spacing and returns created IDs and text-overlap status.',
    inputSchema: {
      type: 'object',
      properties: {
        packagePath: {
          type: 'string',
          description:
            'Exact document.packagePath from getWhiteboardContext, fn_analyzeBoard, or createWhiteboard. Refuses if the tab changed documents.',
        },
        title: {
          type: 'string',
          description: 'Optional heading text placed cleanly above the diagram.',
        },
        layout: {
          type: 'string',
          enum: ['left-to-right', 'top-to-bottom', 'grid'],
          description: 'Automatic layout direction (default "left-to-right").',
        },
        nodes: {
          type: 'array',
          description:
            'Diagram nodes to create (1 to 40). Each node needs a unique key and label.',
          items: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Unique local key referenced by edges.',
              },
              label: {
                type: 'string',
                description: 'Label text inside the shape.',
              },
              shape: {
                type: 'string',
                enum: ['rectangle', 'ellipse', 'diamond'],
                description: 'Shape geometry (default "rectangle").',
              },
              backgroundColor: {
                type: 'string',
                description: 'Hex fill, named Excalidraw color, or "transparent".',
              },
              strokeColor: {
                type: 'string',
                description: 'Stroke color (default "#1e1e1e").',
              },
              width: { type: 'number' },
              height: { type: 'number' },
              lane: {
                type: 'string',
                description: 'Optional swimlane name to align parallel tracks.',
              },
            },
            required: ['key', 'label'],
          },
        },
        edges: {
          type: 'array',
          description:
            'Optional directed bound arrows connecting node keys or existing board element IDs.',
          items: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                description: 'Source node key or existing board element ID.',
              },
              to: {
                type: 'string',
                description: 'Target node key or existing board element ID.',
              },
              label: {
                type: 'string',
                description: 'Optional arrow label.',
              },
            },
            required: ['from', 'to'],
          },
        },
        origin: {
          type: 'object',
          description:
            'Optional top-left anchor { x, y }; omitted defaults to clear space beside existing elements.',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
        gapX: {
          type: 'number',
          description: 'Horizontal gap between nodes in scene units (default 90).',
        },
        gapY: {
          type: 'number',
          description: 'Vertical gap between nodes in scene units (default 70).',
        },
      },
      required: ['packagePath', 'nodes'],
    },
    run: async (ctx, args) => {
      const readyCtx = await runWhenCanvasReady(() => ctx)
      assertWhiteboardTarget(args.packagePath, readyCtx.document?.packagePath)
      const api = ensureApi(readyCtx)
      const existing = liveElements(api)
      const existingById = new Map(existing.map(el => [el.id, el]))
      const usedIds = new Set(existing.map(el => el.id))

      if (!Array.isArray(args.nodes) || args.nodes.length === 0) {
        throw new WhiteboardToolError(
          'nodes must be a non-empty array of diagram node definitions.',
        )
      }
      if (args.nodes.length > 40) {
        throw new WhiteboardToolError(
          'fn_buildDiagram accepts at most 40 nodes per call.',
        )
      }

      const layoutRaw = optionalString(args.layout) ?? 'left-to-right'
      if (
        layoutRaw !== 'left-to-right' &&
        layoutRaw !== 'top-to-bottom' &&
        layoutRaw !== 'grid'
      ) {
        throw new WhiteboardToolError(
          'layout must be one of: left-to-right, top-to-bottom, grid.',
        )
      }

      const gapX = Math.max(20, finiteNumber(args.gapX, 90))
      const gapY = Math.max(20, finiteNumber(args.gapY, 70))
      const title = optionalString(args.title)

      const parsedNodes: ParsedDiagramNode[] = []
      const nodeByKey = new Map<string, ParsedDiagramNode>()
      const laneOrder: string[] = []

      for (const rawNode of args.nodes) {
        if (!isPlainObject(rawNode)) {
          throw new WhiteboardToolError('Each node entry must be an object.')
        }
        const key = optionalString(rawNode.key)
        const label = optionalString(rawNode.label)
        if (!key) throw new WhiteboardToolError('Each node requires a non-empty key.')
        if (!label) {
          throw new WhiteboardToolError(`Node "${key}" requires a non-empty label.`)
        }
        if (nodeByKey.has(key)) {
          throw new WhiteboardToolError(`Duplicate node key "${key}".`)
        }
        const shapeRaw = optionalString(rawNode.shape) ?? 'rectangle'
        if (!SHAPES.includes(shapeRaw as WhiteboardShape)) {
          throw new WhiteboardToolError(
            `Node "${key}" shape must be one of: ${SHAPES.join(', ')}.`,
          )
        }
        const shape = shapeRaw as WhiteboardShape
        const { width, height } = estimateNodeSize(
          label,
          shape,
          optionalNumber(rawNode.width),
          optionalNumber(rawNode.height),
        )
        const lane = optionalString(rawNode.lane)
        if (lane && !laneOrder.includes(lane)) laneOrder.push(lane)

        const node: ParsedDiagramNode = {
          key,
          id: makeUniqueId(usedIds, 'node'),
          label,
          shape,
          backgroundColor: optionalString(rawNode.backgroundColor) ?? 'transparent',
          strokeColor: optionalString(rawNode.strokeColor) ?? '#1e1e1e',
          width,
          height,
          lane,
          x: 0,
          y: 0,
        }
        parsedNodes.push(node)
        nodeByKey.set(key, node)
      }

      const rawEdges = args.edges ?? []
      if (!Array.isArray(rawEdges)) {
        throw new WhiteboardToolError('edges must be an array when provided.')
      }
      const parsedEdges: ParsedDiagramEdge[] = []
      const referencedExisting = new Map<string, WhiteboardElementLike>()

      const resolveEndpoint = (ref: string, field: string) => {
        const newNode = nodeByKey.get(ref)
        if (newNode) return { id: newNode.id, isNew: true, key: newNode.key }
        const existingEl = existingById.get(ref)
        if (!existingEl) {
          throw new WhiteboardToolError(
            `Edge ${field} "${ref}" matches neither a node key nor an existing board element ID.`,
          )
        }
        if (!BINDABLE_TYPES.has(existingEl.type)) {
          throw new WhiteboardToolError(
            `Edge ${field} "${ref}" is a ${existingEl.type} and cannot be bound by an arrow.`,
          )
        }
        referencedExisting.set(existingEl.id, existingEl)
        return { id: existingEl.id, isNew: false, key: undefined }
      }

      for (const rawEdge of rawEdges) {
        if (!isPlainObject(rawEdge)) {
          throw new WhiteboardToolError('Each edge entry must be an object.')
        }
        const from = optionalString(rawEdge.from)
        const to = optionalString(rawEdge.to)
        if (!from || !to) {
          throw new WhiteboardToolError('Each edge requires non-empty "from" and "to".')
        }
        const fromResolved = resolveEndpoint(from, 'from')
        const toResolved = resolveEndpoint(to, 'to')
        if (fromResolved.id === toResolved.id) {
          throw new WhiteboardToolError(
            `Edge "${from}" -> "${to}" cannot connect an element to itself.`,
          )
        }
        parsedEdges.push({
          from: fromResolved.id,
          to: toResolved.id,
          label: optionalString(rawEdge.label),
        })
      }

      // Compute node coordinates
      const origin = resolveOrigin(existing, args.origin)
      const bodyOffsetY = title ? 56 : 0
      const baseX = origin.x
      const baseY = origin.y + bodyOffsetY

      if (layoutRaw === 'grid') {
        const cols = Math.ceil(Math.sqrt(parsedNodes.length))
        const rows = Math.ceil(parsedNodes.length / cols)
        const colWidths = new Array<number>(cols).fill(0)
        const rowHeights = new Array<number>(rows).fill(0)
        parsedNodes.forEach((node, index) => {
          const r = Math.floor(index / cols)
          const c = index % cols
          colWidths[c] = Math.max(colWidths[c], node.width)
          rowHeights[r] = Math.max(rowHeights[r], node.height)
        })
        const colX: number[] = []
        let cx = baseX
        for (let c = 0; c < cols; c++) {
          colX.push(cx)
          cx += colWidths[c] + gapX
        }
        const rowY: number[] = []
        let ry = baseY
        for (let r = 0; r < rows; r++) {
          rowY.push(ry)
          ry += rowHeights[r] + gapY
        }
        parsedNodes.forEach((node, index) => {
          const r = Math.floor(index / cols)
          const c = index % cols
          node.x = Math.round(colX[c] + (colWidths[c] - node.width) / 2)
          node.y = Math.round(rowY[r] + (rowHeights[r] - node.height) / 2)
        })
      } else {
        // Layered topological ranking among new nodes
        const idToNode = new Map(parsedNodes.map(n => [n.id, n]))
        const outgoing = new Map<string, string[]>(parsedNodes.map(n => [n.id, []]))
        const inDeg = new Map<string, number>(parsedNodes.map(n => [n.id, 0]))
        for (const edge of parsedEdges) {
          if (idToNode.has(edge.from) && idToNode.has(edge.to)) {
            outgoing.get(edge.from)!.push(edge.to)
            inDeg.set(edge.to, (inDeg.get(edge.to) ?? 0) + 1)
          }
        }
        const rank = new Map<string, number>()
        const queue: string[] = parsedNodes
          .filter(n => (inDeg.get(n.id) ?? 0) === 0)
          .map(n => n.id)
        if (queue.length === 0) {
          // Pure cycle fallback: seed first node at rank 0
          queue.push(parsedNodes[0].id)
        }
        for (const id of queue) rank.set(id, 0)

        let steps = 0
        const maxSteps = parsedNodes.length * parsedNodes.length + 10
        while (queue.length > 0 && steps < maxSteps) {
          steps++
          const current = queue.shift()!
          const curRank = rank.get(current) ?? 0
          for (const next of outgoing.get(current) ?? []) {
            const candidate = Math.min(parsedNodes.length - 1, curRank + 1)
            const prev = rank.get(next)
            if (prev === undefined || candidate > prev) {
              rank.set(next, candidate)
              queue.push(next)
            }
          }
        }
        for (const n of parsedNodes) {
          if (!rank.has(n.id)) rank.set(n.id, 0)
        }

        const layers = new Map<number, ParsedDiagramNode[]>()
        for (const n of parsedNodes) {
          const r = rank.get(n.id) ?? 0
          const bucket = layers.get(r) ?? []
          bucket.push(n)
          layers.set(r, bucket)
        }
        const sortedLayerIndices = [...layers.keys()].sort((a, b) => a - b)

        if (laneOrder.length > 0) {
          for (const list of layers.values()) {
            list.sort((a, b) => {
              const la = a.lane ? laneOrder.indexOf(a.lane) : laneOrder.length
              const lb = b.lane ? laneOrder.indexOf(b.lane) : laneOrder.length
              return la - lb
            })
          }
        }

        if (layoutRaw === 'left-to-right') {
          const layerSpans = sortedLayerIndices.map(idx => {
            const list = layers.get(idx)!
            const totalH =
              list.reduce((sum, n) => sum + n.height, 0) +
              Math.max(0, list.length - 1) * gapY
            const maxW = Math.max(...list.map(n => n.width))
            return { idx, list, totalH, maxW }
          })
          const maxLayerH = Math.max(...layerSpans.map(l => l.totalH))
          let cursorX = baseX
          for (const layer of layerSpans) {
            let cursorY = baseY + Math.round((maxLayerH - layer.totalH) / 2)
            for (const node of layer.list) {
              node.x = Math.round(cursorX + (layer.maxW - node.width) / 2)
              node.y = Math.round(cursorY)
              cursorY += node.height + gapY
            }
            cursorX += layer.maxW + gapX
          }
        } else {
          // top-to-bottom
          const layerSpans = sortedLayerIndices.map(idx => {
            const list = layers.get(idx)!
            const totalW =
              list.reduce((sum, n) => sum + n.width, 0) +
              Math.max(0, list.length - 1) * gapX
            const maxH = Math.max(...list.map(n => n.height))
            return { idx, list, totalW, maxH }
          })
          const maxLayerW = Math.max(...layerSpans.map(l => l.totalW))
          let cursorY = baseY
          for (const layer of layerSpans) {
            let cursorX = baseX + Math.round((maxLayerW - layer.totalW) / 2)
            for (const node of layer.list) {
              node.x = Math.round(cursorX)
              node.y = Math.round(cursorY + (layer.maxH - node.height) / 2)
              cursorX += node.width + gapX
            }
            cursorY += layer.maxH + gapY
          }
        }
      }

      // Build single Excalidraw batch
      const batchSpecs: Array<Record<string, unknown>> = []
      for (const existingEl of referencedExisting.values()) {
        batchSpecs.push({ ...existingEl })
      }
      let titleId: string | undefined
      if (title) {
        titleId = makeUniqueId(usedIds, 'title')
        batchSpecs.push({
          id: titleId,
          type: 'text',
          x: origin.x,
          y: origin.y,
          text: title,
          fontSize: 26,
        })
      }

      const geometryById = new Map<
        string,
        { x: number; y: number; width?: number; height?: number }
      >()
      for (const existingEl of referencedExisting.values()) {
        geometryById.set(existingEl.id, existingEl)
      }
      for (const node of parsedNodes) {
        geometryById.set(node.id, node)
        batchSpecs.push({
          id: node.id,
          type: node.shape,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          backgroundColor: node.backgroundColor,
          strokeColor: node.strokeColor,
          label: { text: node.label },
        })
      }

      const arrowIds: string[] = []
      for (const edge of parsedEdges) {
        const arrowId = makeUniqueId(usedIds, 'arrow')
        arrowIds.push(arrowId)
        const geom = arrowGeometry(
          geometryById.get(edge.from)!,
          geometryById.get(edge.to)!,
        )
        batchSpecs.push({
          id: arrowId,
          type: 'arrow',
          x: geom.x,
          y: geom.y,
          width: geom.width,
          height: geom.height,
          start: { id: edge.from },
          end: { id: edge.to },
          ...(edge.label ? { label: { text: edge.label } } : {}),
        })
      }

      const converted = createdElements(batchSpecs, { regenerateIds: false })
      const byId = new Map(converted.map(el => [el.id, el]))
      const known = new Set(existing.map(el => el.id))
      const nextScene = [
        ...existing.map(el => byId.get(el.id) ?? el),
        ...converted.filter(el => !known.has(el.id)),
      ]

      commit(api, nextScene)
      const savedPackagePath = await readyCtx.save()

      const createdOnly = converted.filter(el => !known.has(el.id))
      const keyToId = Object.fromEntries(parsedNodes.map(n => [n.key, n.id]))
      const overlaps = textOverlaps(nextScene)

      return {
        summary: `Built ${layoutRaw} diagram${title ? ` "${title}"` : ''} with ${parsedNodes.length} node${parsedNodes.length === 1 ? '' : 's'} and ${arrowIds.length} bound arrow${arrowIds.length === 1 ? '' : 's'}.`,
        mutated: true,
        data: {
          savedPackagePath,
          layout: layoutRaw,
          ...(titleId ? { titleId } : {}),
          keyToId,
          createdNodeIds: parsedNodes.map(n => n.id),
          createdArrowIds: arrowIds,
          bounds: computeBounds(createdOnly),
          textOverlaps: overlaps,
        },
      }
    },
  })

// ---------------------------------------------------------------------------
// 3. fn_createStickyBoard (write)
// ---------------------------------------------------------------------------
interface ParsedStickyNote {
  text: string
  color: string
  strokeColor: string
}

interface ParsedStickyGroup {
  title: string
  headerBg: string
  noteBg: string
  strokeColor: string
  notes: ParsedStickyNote[]
}

export const fn_createStickyBoard: AppFunctionDefinition<WhiteboardAgentContext> =
  defineAppFunction<WhiteboardAgentContext>({
    name: 'fn_createStickyBoard',
    category: 'brainstorming',
    risk: 'write',
    requiresApproval: false,
    replaces: ['addShape', 'addText'],
    description:
      'Create a structured brainstorming, affinity-map, retrospective, or kanban sticky-note board with color-coded themed columns or cluster grids in one atomic undoable step and save it. Call getWhiteboardContext first to inspect the board and obtain document.packagePath. Automatically sizes sticky cards and places the board clear of existing content.',
    inputSchema: {
      type: 'object',
      properties: {
        packagePath: {
          type: 'string',
          description:
            'Exact document.packagePath from getWhiteboardContext, fn_analyzeBoard, or createWhiteboard. Refuses if the tab changed documents.',
        },
        boardTitle: {
          type: 'string',
          description: 'Optional overall title placed above the sticky groups.',
        },
        groups: {
          type: 'array',
          description: 'Themed sticky-note columns or clusters (1 to 12 groups).',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Header label for the column or cluster.',
              },
              color: {
                type: 'string',
                description:
                  'Optional fill color for notes in this group (defaults to a curated pastel palette).',
              },
              strokeColor: {
                type: 'string',
                description: 'Optional border stroke color for this group.',
              },
              notes: {
                type: 'array',
                description:
                  'Sticky notes in this group: strings or { text, color?, strokeColor? } objects.',
                items: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        color: { type: 'string' },
                        strokeColor: { type: 'string' },
                      },
                      required: ['text'],
                    },
                  ],
                },
              },
            },
            required: ['title', 'notes'],
          },
        },
        arrangement: {
          type: 'string',
          enum: ['columns', 'grid'],
          description:
            'Lay groups side-by-side as vertical columns (default "columns") or wrap into a 2D cluster grid ("grid").',
        },
        noteWidth: {
          type: 'number',
          description: 'Sticky card width in scene units (default 220).',
        },
        origin: {
          type: 'object',
          description:
            'Optional top-left anchor { x, y }; omitted defaults to clear space beside existing elements.',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
      },
      required: ['packagePath', 'groups'],
    },
    run: async (ctx, args) => {
      const readyCtx = await runWhenCanvasReady(() => ctx)
      assertWhiteboardTarget(args.packagePath, readyCtx.document?.packagePath)
      const api = ensureApi(readyCtx)
      const existing = liveElements(api)
      const usedIds = new Set(existing.map(el => el.id))

      if (!Array.isArray(args.groups) || args.groups.length === 0) {
        throw new WhiteboardToolError(
          'groups must be a non-empty array of sticky-note group definitions.',
        )
      }
      if (args.groups.length > 12) {
        throw new WhiteboardToolError(
          'fn_createStickyBoard accepts at most 12 groups per call.',
        )
      }

      const arrangement = optionalString(args.arrangement) ?? 'columns'
      if (arrangement !== 'columns' && arrangement !== 'grid') {
        throw new WhiteboardToolError(
          'arrangement must be either "columns" or "grid".',
        )
      }

      const boardTitle = optionalString(args.boardTitle)
      const noteWidth = Math.max(140, Math.round(finiteNumber(args.noteWidth, 220)))
      const headerHeight = 56
      const headerGap = 20
      const noteGap = 20
      const colGap = 56
      const rowGap = 64

      let totalNotes = 0
      const parsedGroups: ParsedStickyGroup[] = args.groups.map(
        (rawGroup, idx) => {
          if (!isPlainObject(rawGroup)) {
            throw new WhiteboardToolError('Each group entry must be an object.')
          }
          const title = optionalString(rawGroup.title)
          if (!title) {
            throw new WhiteboardToolError(
              `Group at index ${idx} requires a non-empty title.`,
            )
          }
          if (!Array.isArray(rawGroup.notes)) {
            throw new WhiteboardToolError(
              `Group "${title}" requires a notes array.`,
            )
          }
          const palette = STICKY_PALETTE[idx % STICKY_PALETTE.length]
          const customBg = optionalString(rawGroup.color)
          const stroke = optionalString(rawGroup.strokeColor) ?? palette.stroke
          const notes: ParsedStickyNote[] = rawGroup.notes.map((rawNote, nIdx) => {
            if (typeof rawNote === 'string') {
              const text = rawNote.trim()
              if (!text) {
                throw new WhiteboardToolError(
                  `Note ${nIdx + 1} in group "${title}" cannot be empty.`,
                )
              }
              return {
                text,
                color: customBg ?? palette.noteBg,
                strokeColor: stroke,
              }
            }
            if (isPlainObject(rawNote)) {
              const text = optionalString(rawNote.text)
              if (!text) {
                throw new WhiteboardToolError(
                  `Note ${nIdx + 1} in group "${title}" requires non-empty text.`,
                )
              }
              return {
                text,
                color: optionalString(rawNote.color) ?? customBg ?? palette.noteBg,
                strokeColor: optionalString(rawNote.strokeColor) ?? stroke,
              }
            }
            throw new WhiteboardToolError(
              `Note ${nIdx + 1} in group "${title}" must be a string or { text } object.`,
            )
          })
          totalNotes += notes.length
          return {
            title,
            headerBg: customBg ?? palette.headerBg,
            noteBg: customBg ?? palette.noteBg,
            strokeColor: stroke,
            notes,
          }
        },
      )

      if (totalNotes > 80) {
        throw new WhiteboardToolError(
          'fn_createStickyBoard accepts at most 80 sticky notes total per call.',
        )
      }

      const origin = resolveOrigin(existing, args.origin)
      const batchSpecs: Array<Record<string, unknown>> = []
      let boardTitleId: string | undefined
      if (boardTitle) {
        boardTitleId = makeUniqueId(usedIds, 'board_title')
        batchSpecs.push({
          id: boardTitleId,
          type: 'text',
          x: origin.x,
          y: origin.y,
          text: boardTitle,
          fontSize: 28,
        })
      }

      const startY = origin.y + (boardTitle ? 58 : 0)
      const cols =
        arrangement === 'columns'
          ? parsedGroups.length
          : Math.max(1, Math.ceil(Math.sqrt(parsedGroups.length)))

      // Pre-compute each group's height so grid rows never collide
      const groupHeights = parsedGroups.map(group => {
        const notesH = group.notes.reduce(
          (sum, note) => sum + estimateStickyHeight(note.text, noteWidth),
          0,
        )
        const gapsH =
          group.notes.length > 0
            ? headerGap + Math.max(0, group.notes.length - 1) * noteGap
            : 0
        return headerHeight + notesH + gapsH
      })

      const rows = Math.ceil(parsedGroups.length / cols)
      const rowY: number[] = []
      let curRowY = startY
      for (let r = 0; r < rows; r++) {
        rowY.push(curRowY)
        let maxH = 0
        for (let c = 0; c < cols; c++) {
          const gIdx = r * cols + c
          if (gIdx < groupHeights.length) {
            maxH = Math.max(maxH, groupHeights[gIdx])
          }
        }
        curRowY += maxH + rowGap
      }

      const groupResults: Array<{
        title: string
        headerId: string
        noteIds: string[]
      }> = []

      parsedGroups.forEach((group, gIdx) => {
        const r = Math.floor(gIdx / cols)
        const c = gIdx % cols
        const gx = Math.round(origin.x + c * (noteWidth + colGap))
        const gy = Math.round(rowY[r])

        const headerId = makeUniqueId(usedIds, 'group')
        batchSpecs.push({
          id: headerId,
          type: 'rectangle',
          x: gx,
          y: gy,
          width: noteWidth,
          height: headerHeight,
          backgroundColor: group.headerBg,
          strokeColor: group.strokeColor,
          label: { text: group.title },
        })

        const noteIds: string[] = []
        let noteY = gy + headerHeight + headerGap
        for (const note of group.notes) {
          const noteId = makeUniqueId(usedIds, 'sticky')
          const nh = estimateStickyHeight(note.text, noteWidth)
          noteIds.push(noteId)
          batchSpecs.push({
            id: noteId,
            type: 'rectangle',
            x: gx,
            y: Math.round(noteY),
            width: noteWidth,
            height: nh,
            backgroundColor: note.color,
            strokeColor: note.strokeColor,
            label: { text: note.text },
          })
          noteY += nh + noteGap
        }
        groupResults.push({ title: group.title, headerId, noteIds })
      })

      const converted = createdElements(batchSpecs, { regenerateIds: false })
      const nextScene = [...existing, ...converted]
      commit(api, nextScene)
      const savedPackagePath = await readyCtx.save()

      const overlaps = textOverlaps(nextScene)
      return {
        summary: `Created sticky board${boardTitle ? ` "${boardTitle}"` : ''} with ${parsedGroups.length} group${parsedGroups.length === 1 ? '' : 's'} and ${totalNotes} note${totalNotes === 1 ? '' : 's'}.`,
        mutated: true,
        data: {
          savedPackagePath,
          arrangement,
          ...(boardTitleId ? { boardTitleId } : {}),
          totalNotes,
          groups: groupResults,
          bounds: computeBounds(converted),
          textOverlaps: overlaps,
        },
      }
    },
  })

// ---------------------------------------------------------------------------
// 4. fn_refineBoard (write)
// ---------------------------------------------------------------------------
interface ParsedStyleRule {
  ids: string[]
  patch: Partial<WhiteboardElementLike>
}

interface ParsedConnection {
  fromId: string
  toId: string
  label?: string
}

interface ParsedAnnotation {
  text: string
  x?: number
  y?: number
  fontSize: number
}

export const fn_refineBoard: AppFunctionDefinition<WhiteboardAgentContext> =
  defineAppFunction<WhiteboardAgentContext>({
    name: 'fn_refineBoard',
    category: 'styling',
    risk: 'write',
    requiresApproval: false,
    replaces: ['styleElement', 'connect', 'addText'],
    description:
      'Batch-refine an existing whiteboard in one atomic undoable step and save it: apply style changes across multiple elements, wire multiple bound labelled arrows, add free-text annotations, and optionally separate overlapping free-text labels for export readiness. Call getWhiteboardContext first to inspect element IDs and obtain document.packagePath.',
    inputSchema: {
      type: 'object',
      properties: {
        packagePath: {
          type: 'string',
          description:
            'Exact document.packagePath from getWhiteboardContext, fn_analyzeBoard, or createWhiteboard. Refuses if the tab changed documents.',
        },
        styles: {
          type: 'array',
          description:
            'Batch style rules; each rule applies fill, stroke, strokeWidth, or opacity to one or more existing element IDs.',
          items: {
            type: 'object',
            properties: {
              ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Existing element IDs to restyle.',
              },
              backgroundColor: { type: 'string' },
              strokeColor: { type: 'string' },
              strokeWidth: { type: 'number' },
              opacity: { type: 'number' },
            },
            required: ['ids'],
          },
        },
        connections: {
          type: 'array',
          description:
            'Batch bound arrows to add between existing bindable elements.',
          items: {
            type: 'object',
            properties: {
              fromId: { type: 'string' },
              toId: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['fromId', 'toId'],
          },
        },
        annotations: {
          type: 'array',
          description: 'Free-text callouts or notes to add to the scene.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              fontSize: { type: 'number' },
            },
            required: ['text'],
          },
        },
        resolveTextOverlaps: {
          type: 'boolean',
          description:
            'When true, automatically nudges colliding free-text elements vertically apart while preserving their exact text verbatim.',
        },
      },
      required: ['packagePath'],
    },
    run: async (ctx, args) => {
      const readyCtx = await runWhenCanvasReady(() => ctx)
      assertWhiteboardTarget(args.packagePath, readyCtx.document?.packagePath)
      const api = ensureApi(readyCtx)
      const existing = liveElements(api)
      const existingById = new Map(existing.map(el => [el.id, el]))
      const usedIds = new Set(existing.map(el => el.id))

      const rawStyles = args.styles ?? []
      const rawConnections = args.connections ?? []
      const rawAnnotations = args.annotations ?? []
      const resolveOverlaps = args.resolveTextOverlaps === true

      if (!Array.isArray(rawStyles)) {
        throw new WhiteboardToolError('styles must be an array when provided.')
      }
      if (!Array.isArray(rawConnections)) {
        throw new WhiteboardToolError('connections must be an array when provided.')
      }
      if (!Array.isArray(rawAnnotations)) {
        throw new WhiteboardToolError('annotations must be an array when provided.')
      }
      if (
        rawStyles.length === 0 &&
        rawConnections.length === 0 &&
        rawAnnotations.length === 0 &&
        !resolveOverlaps
      ) {
        throw new WhiteboardToolError(
          'Nothing to refine: provide styles, connections, annotations, or resolveTextOverlaps: true.',
        )
      }

      // 1. Validate style rules upfront
      const parsedStyles: ParsedStyleRule[] = rawStyles.map((raw, idx) => {
        if (!isPlainObject(raw)) {
          throw new WhiteboardToolError(`Style rule ${idx + 1} must be an object.`)
        }
        if (!Array.isArray(raw.ids) || raw.ids.length === 0) {
          throw new WhiteboardToolError(
            `Style rule ${idx + 1} requires a non-empty ids array.`,
          )
        }
        const ids = raw.ids.map(item => {
          const id = optionalString(item)
          if (!id) {
            throw new WhiteboardToolError(
              `Style rule ${idx + 1} contains an empty element id.`,
            )
          }
          if (!existingById.has(id)) {
            throw new WhiteboardToolError(
              `No element "${id}". Call getWhiteboardContext for the current ids.`,
            )
          }
          return id
        })
        const patch: Partial<WhiteboardElementLike> = {}
        const backgroundColor = optionalString(raw.backgroundColor)
        if (backgroundColor) patch.backgroundColor = backgroundColor
        const strokeColor = optionalString(raw.strokeColor)
        if (strokeColor) patch.strokeColor = strokeColor
        const strokeWidth = optionalNumber(raw.strokeWidth)
        if (strokeWidth !== undefined) patch.strokeWidth = Math.max(0.5, strokeWidth)
        const opacity = optionalNumber(raw.opacity)
        if (opacity !== undefined) {
          patch.opacity = Math.min(100, Math.max(0, Math.round(opacity)))
        }
        if (!Object.keys(patch).length) {
          throw new WhiteboardToolError(
            `Style rule ${idx + 1} has nothing to change: pass backgroundColor, strokeColor, strokeWidth, or opacity.`,
          )
        }
        return { ids, patch }
      })

      // 2. Validate connections upfront
      const parsedConnections: ParsedConnection[] = rawConnections.map(
        (raw, idx) => {
          if (!isPlainObject(raw)) {
            throw new WhiteboardToolError(
              `Connection ${idx + 1} must be an object.`,
            )
          }
          const fromId = optionalString(raw.fromId)
          const toId = optionalString(raw.toId)
          if (!fromId || !toId) {
            throw new WhiteboardToolError(
              `Connection ${idx + 1} requires non-empty fromId and toId.`,
            )
          }
          if (fromId === toId) {
            throw new WhiteboardToolError(
              `Connection ${idx + 1}: fromId and toId must be different elements.`,
            )
          }
          const fromEl = existingById.get(fromId)
          if (!fromEl) {
            throw new WhiteboardToolError(
              `No element "${fromId}". Call getWhiteboardContext for the current ids.`,
            )
          }
          const toEl = existingById.get(toId)
          if (!toEl) {
            throw new WhiteboardToolError(
              `No element "${toId}". Call getWhiteboardContext for the current ids.`,
            )
          }
          for (const endpoint of [fromEl, toEl]) {
            if (!BINDABLE_TYPES.has(endpoint.type)) {
              throw new WhiteboardToolError(
                `"${endpoint.id}" is a ${endpoint.type}; arrows connect shapes, text and images.`,
              )
            }
          }
          return { fromId, toId, label: optionalString(raw.label) }
        },
      )

      // 3. Validate annotations upfront
      const parsedAnnotations: ParsedAnnotation[] = rawAnnotations.map(
        (raw, idx) => {
          if (!isPlainObject(raw)) {
            throw new WhiteboardToolError(
              `Annotation ${idx + 1} must be an object.`,
            )
          }
          const text = optionalString(raw.text)
          if (!text) {
            throw new WhiteboardToolError(
              `Annotation ${idx + 1} requires non-empty text.`,
            )
          }
          return {
            text,
            x: optionalNumber(raw.x),
            y: optionalNumber(raw.y),
            fontSize: Math.max(8, finiteNumber(raw.fontSize, 20)),
          }
        },
      )

      // Apply styles in-memory
      let working = [...existing]
      const styledIds = new Set<string>()
      if (parsedStyles.length > 0) {
        const mergedPatches = new Map<string, Partial<WhiteboardElementLike>>()
        for (const rule of parsedStyles) {
          for (const id of rule.ids) {
            mergedPatches.set(id, { ...mergedPatches.get(id), ...rule.patch })
            styledIds.add(id)
          }
        }
        working = working.map(el => {
          const patch = mergedPatches.get(el.id)
          return patch ? touched(el, patch) : el
        })
      }

      // Apply connections & annotations in one Excalidraw batch
      const createdArrowIds: string[] = []
      const createdAnnotationIds: string[] = []
      if (parsedConnections.length > 0 || parsedAnnotations.length > 0) {
        const workingById = new Map(working.map(el => [el.id, el]))
        const referencedEndpoints = new Map<string, WhiteboardElementLike>()
        for (const conn of parsedConnections) {
          referencedEndpoints.set(conn.fromId, workingById.get(conn.fromId)!)
          referencedEndpoints.set(conn.toId, workingById.get(conn.toId)!)
        }

        const batchSpecs: Array<Record<string, unknown>> = Array.from(
          referencedEndpoints.values(),
          el => ({ ...el }),
        )

        for (const conn of parsedConnections) {
          const arrowId = makeUniqueId(usedIds, 'arrow')
          createdArrowIds.push(arrowId)
          const geom = arrowGeometry(
            workingById.get(conn.fromId)!,
            workingById.get(conn.toId)!,
          )
          batchSpecs.push({
            id: arrowId,
            type: 'arrow',
            x: geom.x,
            y: geom.y,
            width: geom.width,
            height: geom.height,
            start: { id: conn.fromId },
            end: { id: conn.toId },
            ...(conn.label ? { label: { text: conn.label } } : {}),
          })
        }

        let defaultAnchor = nextFreePosition(working)
        for (const ann of parsedAnnotations) {
          const annId = makeUniqueId(usedIds, 'note')
          createdAnnotationIds.push(annId)
          const x = ann.x !== undefined ? Math.round(ann.x) : defaultAnchor.x
          const y = ann.y !== undefined ? Math.round(ann.y) : defaultAnchor.y
          if (ann.x === undefined && ann.y === undefined) {
            defaultAnchor = {
              x: defaultAnchor.x,
              y: defaultAnchor.y + Math.round(ann.fontSize * 2.2),
            }
          }
          batchSpecs.push({
            id: annId,
            type: 'text',
            x,
            y,
            text: ann.text,
            fontSize: ann.fontSize,
          })
        }

        const converted = createdElements(batchSpecs, { regenerateIds: false })
        const byId = new Map(converted.map(el => [el.id, el]))
        const known = new Set(working.map(el => el.id))
        working = [
          ...working.map(el => byId.get(el.id) ?? el),
          ...converted.filter(el => !known.has(el.id)),
        ]
      }

      // Optional non-destructive overlap resolution for free-text labels
      const repositionedTextIds = new Set<string>()
      if (resolveOverlaps) {
        const SEPARATION_GAP = 12
        for (let pass = 0; pass < 32; pass++) {
          const pairs = textOverlaps(working)
          if (pairs.length === 0) break
          let movedAny = false
          const indexById = new Map(working.map((el, i) => [el.id, i]))
          for (const pair of pairs) {
            const idxA = indexById.get(pair.first)
            const idxB = indexById.get(pair.second)
            if (idxA === undefined || idxB === undefined) continue
            const a = working[idxA]
            const b = working[idxB]
            const aFree = !a.containerId
            const bFree = !b.containerId
            if (!aFree && !bFree) continue

            // Move the free-text element (if both are free, move the lower/second one)
            let moverIdx: number
            let anchor: WhiteboardElementLike
            if (aFree && !bFree) {
              moverIdx = idxA
              anchor = b
            } else if (bFree && !aFree) {
              moverIdx = idxB
              anchor = a
            } else if (b.y >= a.y) {
              moverIdx = idxB
              anchor = a
            } else {
              moverIdx = idxA
              anchor = b
            }
            const mover = working[moverIdx]
            const targetY = Math.round(
              anchor.y + Math.max(20, anchor.height ?? 20) + SEPARATION_GAP,
            )
            if (targetY > mover.y) {
              working[moverIdx] = touched(mover, { y: targetY })
              repositionedTextIds.add(mover.id)
              movedAny = true
              break
            }
          }
          if (!movedAny) break
        }
      }

      const mutated =
        styledIds.size > 0 ||
        createdArrowIds.length > 0 ||
        createdAnnotationIds.length > 0 ||
        repositionedTextIds.size > 0

      let savedPackagePath: string | undefined
      if (mutated) {
        commit(api, working)
        savedPackagePath = await readyCtx.save()
      }

      const remainingTextOverlaps = textOverlaps(working)
      const parts: string[] = []
      if (styledIds.size) {
        parts.push(`restyled ${styledIds.size} element${styledIds.size === 1 ? '' : 's'}`)
      }
      if (createdArrowIds.length) {
        parts.push(
          `added ${createdArrowIds.length} arrow${createdArrowIds.length === 1 ? '' : 's'}`,
        )
      }
      if (createdAnnotationIds.length) {
        parts.push(
          `added ${createdAnnotationIds.length} annotation${createdAnnotationIds.length === 1 ? '' : 's'}`,
        )
      }
      if (repositionedTextIds.size) {
        parts.push(
          `separated ${repositionedTextIds.size} overlapping text label${repositionedTextIds.size === 1 ? '' : 's'}`,
        )
      }

      return {
        summary: mutated
          ? `Refined whiteboard: ${parts.join(', ')}.`
          : 'Checked whiteboard: no overlapping free-text labels needed repositioning.',
        mutated,
        data: {
          ...(savedPackagePath ? { savedPackagePath } : {}),
          styledIds: [...styledIds],
          createdArrowIds,
          createdAnnotationIds,
          repositionedTextIds: [...repositionedTextIds],
          remainingTextOverlaps,
        },
      }
    },
  })

export const PUREWHITEBOARD_FUNCTIONS: readonly AppFunctionDefinition<WhiteboardAgentContext>[] =
  [
    fn_analyzeBoard,
    fn_buildDiagram,
    fn_createStickyBoard,
    fn_refineBoard,
  ]
