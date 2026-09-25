import { WHITEBOARD_APP_SLUG, WHITEBOARD_SCENE_FILE_NAME } from '../constants'
import type { WhiteboardElementLike } from './whiteboardScene'
import { whiteboardPackageBaseName } from './whiteboardPaths'

export interface WhiteboardSceneDocument {
  schemaVersion: 1
  type: 'whiteboard.scene'
  elements: readonly WhiteboardElementLike[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
  updatedAt: string
}

export interface WhiteboardPackageManifest {
  schemaVersion: 1
  appId: 'purewhiteboard'
  slug: typeof WHITEBOARD_APP_SLUG
  kind: 'whiteboard'
  name: string
  sceneFile: typeof WHITEBOARD_SCENE_FILE_NAME
  createdAt: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sanitizeWhiteboardAppState(
  appState?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!appState) return undefined
  const sanitized = Object.fromEntries(
    Object.entries(appState).filter(([key, value]) => {
      return (
        key !== 'collaborators' &&
        value !== undefined &&
        typeof value !== 'function' &&
        typeof value !== 'symbol'
      )
    }),
  )
  return Object.keys(sanitized).length ? sanitized : undefined
}

export function createDefaultWhiteboardScene(): WhiteboardSceneDocument {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    type: 'whiteboard.scene',
    elements: [],
    appState: {
      viewBackgroundColor: '#ffffff',
    },
    files: {},
    updatedAt: now,
  }
}

export function createWhiteboardSceneDocument(input: {
  elements: readonly WhiteboardElementLike[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}): WhiteboardSceneDocument {
  return {
    schemaVersion: 1,
    type: 'whiteboard.scene',
    // Excalidraw keeps deleted elements as tombstones in the live scene;
    // the file keeps only what is drawn.
    elements: input.elements.filter(element => !element.isDeleted),
    appState: sanitizeWhiteboardAppState(input.appState),
    files: input.files ?? {},
    updatedAt: new Date().toISOString(),
  }
}

export function parseWhiteboardScene(raw: string): WhiteboardSceneDocument {
  const parsed = JSON.parse(raw) as unknown
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.elements) ||
    !parsed.elements.every(
      element =>
        isRecord(element) &&
        typeof element.id === 'string' &&
        typeof element.type === 'string',
    )
  ) {
    throw new Error(
      'Invalid whiteboard scene: expected an elements array of drawing objects.',
    )
  }
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported whiteboard schema version: ${String(parsed.schemaVersion)}`)
  }
  const elements = parsed.elements as WhiteboardElementLike[]
  if (new Set(elements.map(element => element.id)).size !== elements.length) {
    throw new Error('Invalid whiteboard scene: duplicate element IDs.')
  }
  return {
    schemaVersion: 1,
    type: 'whiteboard.scene',
    elements,
    appState: isRecord(parsed.appState)
      ? sanitizeWhiteboardAppState(parsed.appState)
      : undefined,
    files: isRecord(parsed.files) ? parsed.files : {},
    updatedAt:
      typeof parsed.updatedAt === 'string'
        ? parsed.updatedAt
        : new Date().toISOString(),
  }
}

export function serializeWhiteboardScene(
  scene: WhiteboardSceneDocument,
): string {
  return `${JSON.stringify(scene, null, 2)}\n`
}

export function createWhiteboardPackageManifest(
  packagePath: string,
  scene: WhiteboardSceneDocument,
  existing?: WhiteboardPackageManifest | null,
): WhiteboardPackageManifest {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    appId: 'purewhiteboard',
    slug: WHITEBOARD_APP_SLUG,
    kind: 'whiteboard',
    name: existing?.name ?? whiteboardPackageBaseName(packagePath),
    sceneFile: WHITEBOARD_SCENE_FILE_NAME,
    createdAt: existing?.createdAt ?? now,
    updatedAt: scene.updatedAt || now,
  }
}

/**
 * Read a package manifest. A package created by PureFiles carries the
 * shell's generic manifest (`title`, `createdAt`); its name and creation
 * time are kept when this app takes the package over.
 */
export function parseWhiteboardPackageManifest(
  raw: string,
): WhiteboardPackageManifest | null {
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed)) return null
  const name =
    typeof parsed.name === 'string' && parsed.name.trim()
      ? parsed.name
      : typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title
      : 'whiteboard'
  return {
    schemaVersion: 1,
    appId: 'purewhiteboard',
    slug: WHITEBOARD_APP_SLUG,
    kind: 'whiteboard',
    name,
    sceneFile: WHITEBOARD_SCENE_FILE_NAME,
    createdAt:
      typeof parsed.createdAt === 'string'
        ? parsed.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof parsed.updatedAt === 'string'
        ? parsed.updatedAt
        : new Date().toISOString(),
  }
}

export function serializeWhiteboardPackageManifest(
  manifest: WhiteboardPackageManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
