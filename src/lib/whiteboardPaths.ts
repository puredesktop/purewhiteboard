import {
  DEFAULT_EXPORT_NAME,
  WHITEBOARD_EXPORTS_DIR,
  WHITEBOARD_PACKAGE_MANIFEST_FILE_NAME,
  WHITEBOARD_PACKAGE_SUFFIX,
  WHITEBOARD_SCENE_FILE_NAME,
} from '../constants'

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/g, '')
}

function resolvePureScienceDirectory(workingDirectory: string): string {
  const clean = trimTrailingSlash(workingDirectory || '')
  if (!clean) return '~/PureScience'
  if (clean.endsWith('/PureScience')) return clean
  if (clean.endsWith('/Documents')) {
    return `${clean.replace(/\/Documents$/, '')}/PureScience`
  }
  return `${clean}/PureScience`
}

export function splitParentPath(path: string): {
  parent: string
  name: string
} {
  const parts = trimTrailingSlash(path).split('/')
  const name = parts.pop() ?? ''
  return {
    parent: parts.join('/') || '/',
    name,
  }
}

export function sanitizeExportFileName(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const safe = (raw || DEFAULT_EXPORT_NAME)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[_.]+|_+$/g, '')
  const named = safe || DEFAULT_EXPORT_NAME
  return named.toLowerCase().endsWith('.png') ? named : `${named}.png`
}

/** Exports live inside the package, beside the scene they were taken from. */
export function resolveWhiteboardExportPath(
  packagePath: string,
  filename: string,
): string {
  return `${trimTrailingSlash(
    packagePath,
  )}/${WHITEBOARD_EXPORTS_DIR}/${sanitizeExportFileName(filename)}`
}

export function sanitizeWhiteboardPackageName(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const safe = (raw || 'whiteboard')
    .replace(/[^\w .-]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[_ .-]+|[_ .-]+$/g, '')
  return safe || 'whiteboard'
}

export function isWhiteboardPackagePath(path: string): boolean {
  return trimTrailingSlash(path).toLowerCase().endsWith(WHITEBOARD_PACKAGE_SUFFIX)
}

export function whiteboardPackageBaseName(packagePath: string): string {
  const { name } = splitParentPath(packagePath)
  if (name.toLowerCase().endsWith(WHITEBOARD_PACKAGE_SUFFIX)) {
    return name.slice(0, -WHITEBOARD_PACKAGE_SUFFIX.length) || 'whiteboard'
  }
  return name || 'whiteboard'
}

export function resolveDefaultWhiteboardPackagePath(
  workingDirectory: string,
): string {
  return `${resolvePureScienceDirectory(
    workingDirectory,
  )}/${sanitizeWhiteboardPackageName('whiteboard')}${WHITEBOARD_PACKAGE_SUFFIX}`
}

export function normalizeWhiteboardPackagePath(
  path: string | null | undefined,
  workingDirectory: string,
): string {
  const trimmed = trimTrailingSlash(path?.trim() ?? '')
  if (!trimmed) return resolveDefaultWhiteboardPackagePath(workingDirectory)
  if (isWhiteboardPackagePath(trimmed)) return trimmed

  const { parent, name } = splitParentPath(trimmed)
  if (name.toLowerCase().endsWith(`${WHITEBOARD_PACKAGE_SUFFIX}.json`)) {
    return isWhiteboardPackagePath(parent)
      ? parent
      : resolveDefaultWhiteboardPackagePath(workingDirectory)
  }
  if (name.endsWith('.json')) {
    return resolveDefaultWhiteboardPackagePath(workingDirectory)
  }

  return `${trimmed}${WHITEBOARD_PACKAGE_SUFFIX}`
}

export function resolveWhiteboardManifestPath(packagePath: string): string {
  return `${trimTrailingSlash(
    packagePath,
  )}/${WHITEBOARD_PACKAGE_MANIFEST_FILE_NAME}`
}

export function resolveWhiteboardScenePath(packagePath: string): string {
  return `${trimTrailingSlash(packagePath)}/${WHITEBOARD_SCENE_FILE_NAME}`
}
