// The single bridge surface for PureWhiteboard. Components never call
// `bridge.call` directly; every shell capability this app uses is a named
// helper here, and method names always come from `PLATFORM_BRIDGE_METHODS`.
// Text and binary writes are atomic on the shell side and create missing
// parent folders, so a package needs no folder bookkeeping here.
import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import { getPlatformPreferences } from '@purescience/platform-ui/bridge/preferences'
import { WHITEBOARD_APP_SLUG } from '../constants'
import type {
  PlatformAppSettingsUpdateRequest,
  PureWhiteboardSettings,
  ShellPreferences,
} from '../types'

export { bridge }

const STANDALONE_SETTINGS_KEY = 'purescience:purewhiteboard:settings'

export function isStandaloneDevMode(): boolean {
  return import.meta.env.DEV && window.parent === window
}

function readStandaloneJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStandaloneJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export async function fetchShellPreferences(): Promise<ShellPreferences> {
  if (isStandaloneDevMode()) {
    return { workingDirectory: '', theme: 'light' }
  }

  return getPlatformPreferences() as Promise<ShellPreferences>
}

export async function fetchWhiteboardSettings(): Promise<PureWhiteboardSettings> {
  if (isStandaloneDevMode()) {
    return readStandaloneJson<PureWhiteboardSettings>(
      STANDALONE_SETTINGS_KEY,
      {},
    )
  }

  return bridge.call<PureWhiteboardSettings>(
    PLATFORM_BRIDGE_METHODS.SETTINGS_APP_GET,
    [WHITEBOARD_APP_SLUG],
  )
}

export async function updateWhiteboardSettings(
  patch: Partial<PureWhiteboardSettings>,
): Promise<PureWhiteboardSettings> {
  if (isStandaloneDevMode()) {
    const nextSettings = {
      ...readStandaloneJson<PureWhiteboardSettings>(
        STANDALONE_SETTINGS_KEY,
        {},
      ),
      ...patch,
    }
    writeStandaloneJson(STANDALONE_SETTINGS_KEY, nextSettings)
    return nextSettings
  }

  const request: PlatformAppSettingsUpdateRequest = {
    appSlug: WHITEBOARD_APP_SLUG,
    patch,
  }
  return bridge.call<PureWhiteboardSettings>(
    PLATFORM_BRIDGE_METHODS.SETTINGS_APP_UPDATE,
    [request],
  )
}

export async function writeBinaryFile(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (isStandaloneDevMode()) {
    throw new Error('Exports need the PureDesktop shell.')
  }
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  await bridge.call(PLATFORM_BRIDGE_METHODS.FS_WRITE_BINARY, [
    { path, base64: btoa(binary) },
  ])
}

export async function readTextFile(path: string): Promise<string> {
  if (isStandaloneDevMode()) {
    const value = window.localStorage.getItem(`purescience:file:${path}`)
    if (value === null) throw new Error(`File not found: ${path}`)
    return value
  }

  return bridge.call<string>(PLATFORM_BRIDGE_METHODS.FS_READ, [path])
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  if (isStandaloneDevMode()) {
    window.localStorage.setItem(`purescience:file:${path}`, content)
    return
  }

  await bridge.call(PLATFORM_BRIDGE_METHODS.FS_WRITE, [path, content])
}
