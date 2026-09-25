import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from '@excalidraw/excalidraw'

export type WhiteboardShape = 'rectangle' | 'ellipse' | 'diamond'

export interface WhiteboardBoundElement {
  id: string
  type: string
}

export interface WhiteboardElementLike {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  text?: string
  isDeleted?: boolean
  /** Set on a text element that is the label of a shape or arrow. */
  containerId?: string | null
  /** Labels and arrows attached to this element. */
  boundElements?: readonly WhiteboardBoundElement[] | null
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  backgroundColor?: string
  strokeColor?: string
  strokeWidth?: number
  opacity?: number
  version?: number
  versionNonce?: number
  [key: string]: unknown
}

export interface WhiteboardApiLike {
  getSceneElements: () => readonly WhiteboardElementLike[]
  getAppState?: () => Record<string, unknown>
  updateScene: (scene: {
    elements: readonly WhiteboardElementLike[]
    appState?: Record<string, unknown>
    files?: Record<string, unknown>
    captureUpdate?: string
  }) => void
  scrollToContent?: (
    elements: readonly WhiteboardElementLike[],
    options?: { fit?: 'contain'; animate?: boolean },
  ) => void
  getFiles?: () => Record<string, unknown>
}

export interface AddShapeInput {
  shape?: unknown
  x?: unknown
  y?: unknown
  width?: unknown
  height?: unknown
  label?: unknown
  backgroundColor?: unknown
  strokeColor?: unknown
}

export interface AddTextInput {
  text?: unknown
  x?: unknown
  y?: unknown
  fontSize?: unknown
}

export interface ConnectInput {
  fromId?: unknown
  toId?: unknown
  label?: unknown
}

export interface StyleElementInput {
  id?: unknown
  backgroundColor?: unknown
  strokeColor?: unknown
  strokeWidth?: unknown
  opacity?: unknown
}

export interface RemoveElementInput {
  id?: unknown
}

export interface ClearWhiteboardInput {
  confirm?: unknown
}

export interface WhiteboardContextElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  /** Free text, or the label of a shape or arrow. */
  text?: string
  /** Arrows: the ids they are bound to, when bound. */
  from?: string
  to?: string
  backgroundColor?: string
  strokeColor?: string
}

export interface WhiteboardContextSnapshot {
  elementCount: number
  selectedElementIds: string[]
  /** True when `elements` lists fewer than `elementCount`. */
  truncated: boolean
  elements: WhiteboardContextElement[]
}

export class WhiteboardToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhiteboardToolError'
  }
}

const SHAPES: WhiteboardShape[] = ['rectangle', 'ellipse', 'diamond']

/** Element types an arrow can bind to (Excalidraw's bindable set). */
const BINDABLE_TYPES = new Set([
  'rectangle',
  'ellipse',
  'diamond',
  'text',
  'image',
  'frame',
  'magicframe',
  'iframe',
  'embeddable',
])

const CONTEXT_ELEMENT_LIMIT = 200
const PLACEMENT_GAP = 40
const DEFAULT_ORIGIN = { x: 120, y: 120 }

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredString(value: unknown, label: string): string {
  const text = optionalString(value)
  if (!text) throw new WhiteboardToolError(`${label} is required.`)
  return text
}

function liveElements(api: WhiteboardApiLike): WhiteboardElementLike[] {
  return api.getSceneElements().filter(element => !element.isDeleted)
}

function findElement(
  elements: readonly WhiteboardElementLike[],
  id: string,
): WhiteboardElementLike {
  const element = elements.find(candidate => candidate.id === id)
  if (!element) {
    throw new WhiteboardToolError(
      `No element "${id}". Call getWhiteboardContext for the current ids.`,
    )
  }
  return element
}

/** A changed copy Excalidraw will re-render: new version, nonce and timestamp. */
function touched(
  element: WhiteboardElementLike,
  patch: Partial<WhiteboardElementLike>,
): WhiteboardElementLike {
  return {
    ...element,
    ...patch,
    version: (typeof element.version === 'number' ? element.version : 0) + 1,
    versionNonce: Math.floor(Math.random() * 0x7fffffff),
    updated: Date.now(),
  }
}

/**
 * The one write path for agent edits: replaces the scene and records the
 * change immediately so ⌘Z undoes an agent's step like the user's own.
 */
function commit(
  api: WhiteboardApiLike,
  elements: readonly WhiteboardElementLike[],
): void {
  api.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
  if (elements.length) {
    api.scrollToContent?.(elements, { fit: 'contain', animate: false })
  }
}

function shapeFromInput(value: unknown): WhiteboardShape {
  if (SHAPES.includes(value as WhiteboardShape)) return value as WhiteboardShape
  throw new WhiteboardToolError(`shape must be one of: ${SHAPES.join(', ')}`)
}

function createdElements(
  specs: Array<Record<string, unknown>>,
  options?: { regenerateIds: boolean },
): WhiteboardElementLike[] {
  return convertToExcalidrawElements(
    specs as never,
    options,
  ) as WhiteboardElementLike[]
}

/**
 * Where a new element lands when the caller gave no position: clear of the
 * existing content, to its right and level with its top.
 */
export function nextFreePosition(
  elements: readonly WhiteboardElementLike[],
): { x: number; y: number } {
  const live = elements.filter(element => !element.isDeleted)
  if (!live.length) return { ...DEFAULT_ORIGIN }
  const right = Math.max(
    ...live.map(element => element.x + Math.max(0, element.width ?? 0)),
  )
  const top = Math.min(...live.map(element => element.y))
  return { x: Math.round(right + PLACEMENT_GAP), y: Math.round(top) }
}

/**
 * A cheap identity for "did the drawing change": element versions move on
 * every edit (and on delete), so scrolling, zooming and selecting — which
 * also fire onChange — do not trigger a save.
 */
export function whiteboardSceneFingerprint(
  elements: readonly WhiteboardElementLike[],
  appState?: Record<string, unknown>,
): string {
  // Preserve identity and stacking order: sums collide for different scenes.
  return JSON.stringify([
    elements.map(element => [element.id, element.version ?? 0,
      element.versionNonce ?? 0, Boolean(element.isDeleted)]),
    String(appState?.viewBackgroundColor ?? ''),
    String(appState?.gridModeEnabled ?? ''),
  ])
}

export function getWhiteboardContext(
  api: WhiteboardApiLike,
): WhiteboardContextSnapshot {
  const elements = liveElements(api)
  const labelByContainer = new Map<string, string>()
  for (const element of elements) {
    if (
      element.type === 'text' &&
      typeof element.containerId === 'string' &&
      typeof element.text === 'string' &&
      element.text.trim()
    ) {
      labelByContainer.set(element.containerId, element.text)
    }
  }
  // Bound labels are addressed through their container, not as elements.
  const addressable = elements.filter(
    element => !(element.type === 'text' && element.containerId),
  )
  const appState = api.getAppState?.() ?? {}
  const selected = appState.selectedElementIds
  const selectedElementIds =
    selected && typeof selected === 'object'
      ? Object.entries(selected as Record<string, unknown>)
          .filter(([, value]) => value === true)
          .map(([id]) => id)
      : []

  return {
    elementCount: addressable.length,
    selectedElementIds,
    truncated: addressable.length > CONTEXT_ELEMENT_LIMIT,
    elements: addressable.slice(0, CONTEXT_ELEMENT_LIMIT).map(element => {
      const ownText =
        typeof element.text === 'string' && element.text.trim()
          ? element.text
          : undefined
      const text = ownText ?? labelByContainer.get(element.id)
      const from = element.startBinding?.elementId
      const to = element.endBinding?.elementId
      return {
        id: element.id,
        type: element.type,
        x: Math.round(element.x),
        y: Math.round(element.y),
        width: Math.round(element.width ?? 0),
        height: Math.round(element.height ?? 0),
        ...(text ? { text } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(typeof element.backgroundColor === 'string' &&
        element.backgroundColor !== 'transparent'
          ? { backgroundColor: element.backgroundColor }
          : {}),
        ...(typeof element.strokeColor === 'string'
          ? { strokeColor: element.strokeColor }
          : {}),
      }
    }),
  }
}

export function addWhiteboardShape(
  api: WhiteboardApiLike,
  input: AddShapeInput,
): WhiteboardElementLike {
  const elements = liveElements(api)
  const shape = shapeFromInput(input.shape ?? 'rectangle')
  const origin = nextFreePosition(elements)
  const x = finiteNumber(input.x, origin.x)
  const y = finiteNumber(input.y, origin.y)
  const width = Math.max(24, finiteNumber(input.width, 180))
  const height = Math.max(24, finiteNumber(input.height, 90))
  const label = optionalString(input.label)
  const backgroundColor = optionalString(input.backgroundColor) ?? 'transparent'
  const strokeColor = optionalString(input.strokeColor) ?? '#1e1e1e'
  const created = createdElements([
    {
      type: shape,
      x,
      y,
      width,
      height,
      backgroundColor,
      strokeColor,
      ...(label ? { label: { text: label } } : {}),
    },
  ])
  commit(api, [...elements, ...created])
  return created.find(element => element.type === shape) ?? created[0]
}

export function addWhiteboardText(
  api: WhiteboardApiLike,
  input: AddTextInput,
): WhiteboardElementLike {
  const elements = liveElements(api)
  const text = requiredString(input.text, 'text')
  const origin = nextFreePosition(elements)
  const created = createdElements([
    {
      type: 'text',
      x: finiteNumber(input.x, origin.x),
      y: finiteNumber(input.y, origin.y),
      text,
      fontSize: Math.max(8, finiteNumber(input.fontSize, 20)),
    },
  ])
  commit(api, [...elements, ...created])
  return created[0]
}

/**
 * Draw a bound arrow between two elements. Excalidraw resolves `start.id`
 * and `end.id` only against elements in the same conversion batch, so both
 * endpoints ride along (ids kept) and come back with the arrow recorded in
 * their `boundElements`; the arrow then follows them when they move.
 */
export function connectWhiteboardElements(
  api: WhiteboardApiLike,
  input: ConnectInput,
): WhiteboardElementLike {
  const fromId = requiredString(input.fromId, 'fromId')
  const toId = requiredString(input.toId, 'toId')
  if (fromId === toId) {
    throw new WhiteboardToolError('fromId and toId must be different elements.')
  }
  const elements = liveElements(api)
  const from = findElement(elements, fromId)
  const to = findElement(elements, toId)
  for (const endpoint of [from, to]) {
    if (!BINDABLE_TYPES.has(endpoint.type)) {
      throw new WhiteboardToolError(
        `"${endpoint.id}" is a ${endpoint.type}; arrows connect shapes, text and images. Pick the element the arrow should point at.`,
      )
    }
  }

  const x1 = from.x + (from.width ?? 0)
  const y1 = from.y + (from.height ?? 0) / 2
  const x2 = to.x
  const y2 = to.y + (to.height ?? 0) / 2
  const label = optionalString(input.label)
  const created = createdElements(
    [
      from,
      to,
      {
        type: 'arrow',
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        start: { id: fromId },
        end: { id: toId },
        ...(label ? { label: { text: label } } : {}),
      },
    ],
    { regenerateIds: false },
  )
  const byId = new Map(created.map(element => [element.id, element]))
  const known = new Set(elements.map(element => element.id))
  const next = [
    ...elements.map(element => byId.get(element.id) ?? element),
    ...created.filter(element => !known.has(element.id)),
  ]
  const arrow = created.find(
    element => element.type === 'arrow' && !known.has(element.id),
  )
  if (!arrow) {
    throw new WhiteboardToolError('Could not create the arrow.')
  }
  commit(api, next)
  return arrow
}

/** Restyle one element in place: fill, stroke, stroke width, opacity. */
export function styleWhiteboardElement(
  api: WhiteboardApiLike,
  input: StyleElementInput,
): WhiteboardElementLike {
  const id = requiredString(input.id, 'id')
  const elements = liveElements(api)
  const element = findElement(elements, id)
  const patch: Partial<WhiteboardElementLike> = {}
  const backgroundColor = optionalString(input.backgroundColor)
  if (backgroundColor) patch.backgroundColor = backgroundColor
  const strokeColor = optionalString(input.strokeColor)
  if (strokeColor) patch.strokeColor = strokeColor
  const strokeWidth = optionalNumber(input.strokeWidth)
  if (strokeWidth !== undefined) patch.strokeWidth = Math.max(0.5, strokeWidth)
  const opacity = optionalNumber(input.opacity)
  if (opacity !== undefined) {
    patch.opacity = Math.min(100, Math.max(0, Math.round(opacity)))
  }
  if (!Object.keys(patch).length) {
    throw new WhiteboardToolError(
      'Nothing to change: pass backgroundColor, strokeColor, strokeWidth (px) or opacity (0-100).',
    )
  }
  const styled = touched(element, patch)
  commit(
    api,
    elements.map(candidate => (candidate.id === id ? styled : candidate)),
  )
  return styled
}

/**
 * Delete one element together with its label; anything that pointed at it
 * (an arrow's binding, a container's bound-element list) is unhooked so the
 * scene never references an element that is gone.
 */
export function removeWhiteboardElement(
  api: WhiteboardApiLike,
  input: RemoveElementInput,
): string[] {
  const id = requiredString(input.id, 'id')
  const elements = liveElements(api)
  findElement(elements, id)
  const removed = new Set([
    id,
    ...elements
      .filter(element => element.containerId === id)
      .map(element => element.id),
  ])
  const next = elements
    .filter(element => !removed.has(element.id))
    .map(element => {
      const patch: Partial<WhiteboardElementLike> = {}
      if (typeof element.frameId === 'string' && removed.has(element.frameId)) {
        patch.frameId = null
      }
      if (element.boundElements?.some(bound => removed.has(bound.id))) {
        patch.boundElements = element.boundElements.filter(
          bound => !removed.has(bound.id),
        )
      }
      if (element.startBinding && removed.has(element.startBinding.elementId)) {
        patch.startBinding = null
      }
      if (element.endBinding && removed.has(element.endBinding.elementId)) {
        patch.endBinding = null
      }
      return Object.keys(patch).length ? touched(element, patch) : element
    })
  commit(api, next)
  return [...removed]
}

/**
 * Erase everything. Refuses without `confirm: true` while the board holds
 * work — the refusal reports what is there so the model can ask properly.
 * Returns how many elements were removed.
 */
export function clearWhiteboard(
  api: WhiteboardApiLike,
  input: ClearWhiteboardInput = {},
): number {
  const elements = liveElements(api)
  if (!elements.length) return 0
  if (input.confirm !== true) {
    const count = elements.length
    throw new WhiteboardToolError(
      `The whiteboard holds ${count} element${count === 1 ? '' : 's'}. Resend with confirm: true only when the user asked to start over; to delete one element use removeElement with its id.`,
    )
  }
  commit(api, [])
  return elements.length
}
