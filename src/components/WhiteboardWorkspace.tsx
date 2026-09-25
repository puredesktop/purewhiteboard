import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import {
  DocumentHeaderActions,
  DocumentSwitcher,
} from '@purescience/platform-ui/components/common/documents'
import { useDocumentLifecycle } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import { bindWhiteboardDocument } from '../lib/bindWhiteboardDocument'
import {
  createPlatformDraft,
  onPlatformDocumentsChanged,
} from '@purescience/platform-ui/bridge/documents.mjs'
import { readOptionalTextFile } from '../lib/readOptionalTextFile'
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
} from '@excalidraw/excalidraw'
import type { ExcalidrawProps } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import {
  readTextFile,
  updateWhiteboardSettings,
  writeBinaryFile,
  writeTextFile,
} from '../bridge/platformBridge'
import {
  AUTOSAVE_DELAY_MS,
  DEFAULT_EXPORT_NAME,
  WHITEBOARD_PACKAGE_SUFFIX,
} from '../constants'
import { usePureWhiteboardAgentTools } from '../hooks/usePureWhiteboardAgentTools'
import {
  whiteboardSceneFingerprint,
  type WhiteboardApiLike,
  type WhiteboardElementLike,
} from '../lib/whiteboardScene'
import {
  normalizeWhiteboardPackagePath,
  resolveWhiteboardExportPath,
  resolveWhiteboardManifestPath,
  resolveWhiteboardScenePath,
  sanitizeExportFileName,
  whiteboardPackageBaseName,
} from '../lib/whiteboardPaths'
import {
  createDefaultWhiteboardScene,
  createWhiteboardPackageManifest,
  createWhiteboardSceneDocument,
  parseWhiteboardPackageManifest,
  parseWhiteboardScene,
  serializeWhiteboardPackageManifest,
  serializeWhiteboardScene,
  type WhiteboardPackageManifest,
  type WhiteboardSceneDocument,
} from '../lib/whiteboardPackage'
import type { PureWhiteboardBootState, WhiteboardResource } from '../types'

interface WhiteboardWorkspaceProps {
  ready: boolean
  boot: PureWhiteboardBootState
  resource: WhiteboardResource | null
  onResourceHandled: () => void
}

type ExcalidrawApi = WhiteboardApiLike

interface PendingSceneSnapshot {
  elements: readonly WhiteboardElementLike[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

/** The package the canvas is bound to; a save carries its own copy. */
interface BoundPackage {
  packagePath: string
  manifest: WhiteboardPackageManifest | null
  /** The package files exist on disk (a new board is written on first change). */
  persisted: boolean
}

interface PendingSave {
  packagePath: string
  snapshot: PendingSceneSnapshot
}

/** Typed loosely on purpose: styled-components' attrs rejects data-* literals. */
const chrome = (kind: string): Record<string, string> => ({ 'data-chrome': kind })

const Root = styled.div`
  --app-acc: oklch(0.55 0.14 282);
  --app-bg: oklch(0.955 0.03 282);
  --app-text: oklch(0.4 0.12 282);
  --app-block: oklch(0.4 0.06 282);
  /* The chrome around the board reads the platform's tokens, so the dark
     theme lights the same room; only the accent family above is the app's. */
  --ink-faint: var(--pure-chrome-muted);
  --surface: var(--pure-chrome-surface);
  --canvas: var(--platform-colors-app-viewport, #f5f4f0);

  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--canvas);
  color: var(--platform-colors-text, #1f2328);
`

const Header = styled.header`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  /* 60, not the platform's 36: Excalidraw's tool island is drawn over this
     row (see .App-menu_top below), and it needs the height. */
  min-height: 60px;
  min-width: 0;
  border-bottom: 1px solid var(--pure-chrome-line);
  background: var(--pure-chrome-bar);
  padding: 9px 16px 9px 18px;
  font-family: var(--platform-typography-font-family);
`

/** The save/export status: platform meta (mono 11, muted). */
const Meta = styled.div.attrs(chrome('meta'))`
  overflow: hidden;
  line-height: 1.3;
  text-overflow: ellipsis;
`

const Actions = styled.footer`
  min-width: 0;
  padding: 4px 12px;
  border-top: 1px solid var(--platform-colors-border, #d8d4ca);
  background: var(--surface);
  justify-content: flex-end;
  display: flex;
  align-items: center;
  gap: 8px;
`

/** The one primary control: 28 tall on the toolbar radius, the app's accent block. */
const Button = styled.button`
  height: var(--pure-chrome-control-height);
  border: 1px solid var(--app-block);
  border-radius: 7px;
  background: var(--app-block);
  padding: 0 12px;
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    border-color: var(--app-acc);
    background: var(--app-acc);
    outline: none;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`

const CanvasHost = styled.main`
  --whiteboard-header-height: 60px;
  --whiteboard-drawer-width: min(var(--pure-chrome-sidebar-width), calc(100vw - 64px));

  position: relative;
  z-index: 2;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  background: var(--canvas);

  .excalidraw {
    --color-primary: var(--app-acc);
    --color-primary-darker: var(--app-block);
    --color-primary-darkest: var(--app-block);
    --color-primary-hover: var(--app-block);
    --color-primary-light: var(--app-bg);
    --color-primary-light-darker: color-mix(in srgb, var(--app-acc) 22%, var(--pure-chrome-surface));
    --color-selection: var(--app-acc);
    --color-logo-icon: var(--app-acc);
    --color-brand-hover: var(--app-block);
    --color-brand-active: var(--app-block);
    --color-on-primary-container: var(--app-text);
    --color-surface-primary-container: var(--app-bg);
    --button-active-bg: var(--app-bg);
    --button-active-border: var(--app-acc);
    --button-selected-bg: var(--app-bg);
    --button-selected-border: var(--app-acc);
    --button-selected-hover-bg: color-mix(in srgb, var(--app-acc) 18%, var(--pure-chrome-surface));
    --focus-highlight-color: color-mix(in srgb, var(--app-acc) 52%, transparent);
    --island-bg-color: var(--surface);
    --sidebar-bg-color: var(--surface);
    --default-bg-color: var(--canvas);
    --default-border-color: var(--pure-chrome-line);
    --button-gray-1: var(--pure-chrome-hover);
    --button-gray-2: color-mix(in srgb, var(--app-acc) 14%, var(--pure-chrome-surface));
    --button-gray-3: color-mix(in srgb, var(--app-acc) 22%, var(--pure-chrome-surface));
    --keybinding-color: var(--ink-faint);
    font-family: var(--platform-typography-font-family);
    height: 100% !important;
    background: var(--canvas);
    overflow: visible;
  }

  .excalidraw .layer-ui__wrapper {
    top: calc(-1 * var(--whiteboard-header-height));
    height: calc(100% + var(--whiteboard-header-height));
  }

  .excalidraw .App-menu_top {
    width: calc(100% + 32px);
    min-height: var(--whiteboard-header-height);
    margin: 0 -16px;
    background: transparent;
    padding: 3px 18px;
  }

  .excalidraw .layer-ui__wrapper__top-right {
    box-sizing: border-box;
    right: auto;
    left: calc(50% + 275px);
    width: auto;
    padding-right: 0;
    pointer-events: none;
    transform: translateX(calc(322px - 50vw));
    visibility: visible;
  }

  .excalidraw .layer-ui__wrapper__top-right > * {
    pointer-events: auto;
  }

  .excalidraw .App-toolbar-container {
    justify-content: center;
  }

  .excalidraw .sidebar-trigger__label-element {
    margin-left: -1px;
  }

  .excalidraw .sidebar-trigger {
    width: 46px;
    min-width: 46px;
    height: 46px;
    border-left-color: transparent;
    border-radius: 0 var(--pure-chrome-radius) var(--pure-chrome-radius) 0;
  }

  .excalidraw .sidebar-trigger__label {
    display: none;
  }

  .excalidraw .FixedSideContainer_side_top {
    inset: 0;
  }

  .excalidraw .App-menu_left {
    height: 100%;
    pointer-events: none;
  }

  /* Excalidraw's properties panel is the app's left sidebar: the platform's
     264 width, 16 inset, sidebar tint and hairline, by token — the DOM is
     the library's, so the attribute route is not open to it. */
  .excalidraw .App-menu__left {
    position: absolute;
    top: var(--whiteboard-header-height);
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    width: var(--whiteboard-drawer-width);
    max-height: none !important;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden auto;
    border: 0;
    border-right: 1px solid var(--pure-chrome-line);
    border-radius: 0;
    background: var(--pure-chrome-sidebar);
    box-shadow: 14px 0 34px rgb(31 35 40 / 8%);
    padding: 12px var(--pure-chrome-inset) 18px;
    pointer-events: auto;
  }

  .excalidraw .App-menu__left::before {
    position: sticky;
    z-index: 1;
    top: -12px;
    display: block;
    height: 1px;
    margin: -12px calc(-1 * var(--pure-chrome-inset)) 10px;
    border-bottom: 1px solid var(--pure-chrome-line);
    background: var(--pure-chrome-sidebar);
    content: '';
  }

  .excalidraw .App-menu__left .panelColumn {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
  }

  .excalidraw .Island {
    border: 1px solid var(--pure-chrome-line);
    border-radius: var(--pure-chrome-radius);
    box-shadow: 0 8px 18px rgb(31 35 40 / 6%);
  }

  .excalidraw .Island.App-menu__left {
    border: 0;
    border-right: 1px solid var(--pure-chrome-line);
    border-radius: 0;
    box-shadow: 14px 0 34px rgb(31 35 40 / 8%);
  }

  .excalidraw .App-toolbar {
    box-shadow: none;
  }

  .excalidraw .App-toolbar .HintViewer {
    display: none;
  }

  .excalidraw .ToolIcon__icon,
  .excalidraw .ToolIcon_type_button,
  .excalidraw .buttonList label,
  .excalidraw .buttonList button,
  .excalidraw .buttonList .zIndexButton,
  .excalidraw .color-picker__button {
    border-radius: 7px;
  }

  .excalidraw .ToolIcon .ToolIcon_type_radio:checked + .ToolIcon__icon,
  .excalidraw .ToolIcon .ToolIcon_type_checkbox:checked + .ToolIcon__icon,
  .excalidraw .ToolIcon_type_button.ToolIcon--selected {
    border-color: var(--app-acc);
    background: var(--app-bg);
    color: var(--app-text);
  }

  .excalidraw .ToolIcon .ToolIcon_type_radio:checked + .ToolIcon__icon svg,
  .excalidraw .ToolIcon .ToolIcon_type_checkbox:checked + .ToolIcon__icon svg,
  .excalidraw .buttonList label.active svg,
  .excalidraw .buttonList button.active svg {
    color: var(--app-text);
  }

  .excalidraw .ToolIcon__keybinding,
  .excalidraw .HintViewer,
  .excalidraw .reset-zoom-button {
    color: var(--ink-faint);
    font-family: var(--platform-typography-font-family-mono);
  }

  .excalidraw .sidebar-trigger {
    border: 1px solid var(--pure-chrome-line);
    border-left-color: transparent;
    border-radius: 0 var(--pure-chrome-radius) var(--pure-chrome-radius) 0;
    background: var(--surface);
    color: var(--pure-chrome-soft);
    box-shadow: none;
  }

  .excalidraw .sidebar-trigger:hover {
    border-color: var(--app-acc);
    color: var(--app-text);
  }

  .excalidraw .panelColumn {
    row-gap: 0.55rem;
    padding: 0;
  }

  .excalidraw .panelColumn h3,
  .excalidraw .panelColumn legend,
  .excalidraw .panelColumn .control-label,
  .excalidraw .color-picker__heading {
    /* Section labels in the sidebar: the platform's mono 10.5, tracked, muted. */
    margin-bottom: 0.2rem;
    color: var(--pure-chrome-muted);
    font-family: var(--platform-typography-font-family-mono);
    font-size: var(--pure-chrome-label-size);
    font-weight: 500;
    letter-spacing: var(--pure-chrome-label-tracking);
    text-transform: uppercase;
  }

  .excalidraw .panelColumn .buttonList {
    gap: 0.35rem;
  }

  .excalidraw .buttonList label,
  .excalidraw .buttonList button,
  .excalidraw .buttonList .zIndexButton {
    --button-width: var(--pure-chrome-control-height);
    --button-height: var(--pure-chrome-control-height);
  }

  .excalidraw .buttonList label.active,
  .excalidraw .buttonList button.active,
  .excalidraw .buttonList .zIndexButton.active,
  .excalidraw .color-picker__button.active .color-picker__button-outline {
    border-color: var(--app-acc);
    background: var(--app-bg);
    box-shadow: inset 0 0 0 1px var(--app-acc);
  }

  .excalidraw .range-input::-webkit-slider-thumb {
    background: var(--app-acc);
  }

  .excalidraw .range-input::-moz-range-thumb {
    background: var(--app-acc);
  }

  @media (max-width: 760px), (max-height: 520px) {
    --whiteboard-drawer-width: min(284px, calc(100vw - 52px));

    .excalidraw .App-menu_top {
      padding: 5px 18px;
    }

    .excalidraw .App-menu__left {
      padding: 10px var(--pure-chrome-inset) 14px;
    }
  }
`

const CanvasPlaceholder = styled.div.attrs(chrome('meta'))`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  white-space: normal;
`

const CanvasNotice = styled(CanvasPlaceholder)`
  padding: 24px;
  text-align: center;
  text-transform: none;
`

async function readWhiteboardManifest(
  packagePath: string,
): Promise<WhiteboardPackageManifest | null> {
  try {
    return parseWhiteboardPackageManifest(
      await readTextFile(resolveWhiteboardManifestPath(packagePath)),
    )
  } catch {
    return null
  }
}

async function writeWhiteboardPackageFiles(
  packagePath: string,
  scene: WhiteboardSceneDocument,
  manifest: WhiteboardPackageManifest,
): Promise<void> {
  await writeTextFile(
    resolveWhiteboardScenePath(packagePath),
    serializeWhiteboardScene(scene),
  )
  await writeTextFile(
    resolveWhiteboardManifestPath(packagePath),
    serializeWhiteboardPackageManifest(manifest),
  )
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function WhiteboardWorkspace({
  ready,
  boot,
  resource,
  onResourceHandled,
}: WhiteboardWorkspaceProps): React.ReactElement {
  const [api, setApi] = useState<ExcalidrawApi | null>(null)
  const apiRef = useRef<ExcalidrawApi | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)
  const [status, setStatus] = useState('Loading...')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const workingDirectory = boot.prefs.workingDirectory ?? ''
  const [packagePath, setPackagePath] = useState(() =>
    normalizeWhiteboardPackagePath(
      boot.appSettings.packagePath,
      workingDirectory,
    ),
  )
  // The scene (or the reason there is none) keyed by the package it came
  // from: a switch shows the placeholder at once instead of mounting the
  // canvas with the previous board for one render.
  const [loaded, setLoaded] = useState<{
    packagePath: string
    scene: WhiteboardSceneDocument | null
    error: string | null
  } | null>(null)
  const current = loaded?.packagePath === packagePath ? loaded : null

  // Assigned together when a load lands; null while switching. A pending
  // save records the path it was taken for, so a switch mid-flight never
  // writes one board's scene into another's package.
  const boundRef = useRef<BoundPackage | null>(null)
  const pendingRef = useRef<PendingSave | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const saveReadyRef = useRef(false)
  const fingerprintRef = useRef('')
  // Writes to a package are serialized: never two autosaves racing.
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())

  const packageName = useMemo(
    () => whiteboardPackageBaseName(packagePath),
    [packagePath],
  )

  /** Write the pending scene, if any, to the package it was taken for. */
  const flushPendingSave = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current
    if (!pending) return writeChainRef.current
    pendingRef.current = null
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const work = async (): Promise<void> => {
      const bound = boundRef.current
      const isBound = bound?.packagePath === pending.packagePath
      const scene = createWhiteboardSceneDocument(pending.snapshot)
      const manifest = createWhiteboardPackageManifest(
        pending.packagePath,
        scene,
        isBound ? bound?.manifest : null,
      )
      if (isBound) setStatus('Saving...')
      try {
        await writeWhiteboardPackageFiles(pending.packagePath, scene, manifest)
      } catch (error) {
        if (!pendingRef.current) pendingRef.current = pending
        throw error
      }
      const after = boundRef.current
      if (after && after.packagePath === pending.packagePath) {
        after.manifest = manifest
        after.persisted = true
        setStatus(`Saved ${whiteboardPackageBaseName(pending.packagePath)}`)
      }
    }
    const next = writeChainRef.current.then(work, work)
    writeChainRef.current = next
    void next.catch(() => undefined)
    return next
  }, [])

  useEffect(() => {
    let cancelled = false
    const scenePath = resolveWhiteboardScenePath(packagePath)
    saveReadyRef.current = false
    boundRef.current = null
    setStatus('Loading...')

    async function loadScene(): Promise<void> {
      // Only a confirmed missing scene file is a new board; a scene that
      // exists but does not parse must not be overwritten by autosave.
      let raw: string | null = null
      try {
        raw = await readOptionalTextFile(readTextFile, scenePath)
      } catch (error) {
        if (cancelled) return
        setLoaded({
          packagePath,
          scene: null,
          error: `Could not read ${scenePath}: ${errorMessage(
            error,
          )}. Reopen the whiteboard after resolving the read error.`,
        })
        setStatus('Not saving')
        return
      }
      let scene = createDefaultWhiteboardScene()
      let persisted = false
      if (raw !== null) {
        try {
          scene = parseWhiteboardScene(raw)
          persisted = true
        } catch (error) {
          if (cancelled) return
          setLoaded({
            packagePath,
            scene: null,
            error: `Could not read ${scenePath}: ${errorMessage(
              error,
            )}. Fix or move the file, then reopen the whiteboard.`,
          })
          setStatus('Not saving')
          return
        }
      }
      const manifest = await readWhiteboardManifest(packagePath)
      if (cancelled) return

      boundRef.current = { packagePath, manifest, persisted }
      fingerprintRef.current = whiteboardSceneFingerprint(
        scene.elements,
        scene.appState,
      )
      setLoaded({ packagePath, scene, error: null })
      saveReadyRef.current = true
      setStatus(
        persisted
          ? `Saved ${packageName}`
          : `New whiteboard — saved to ${packageName}${WHITEBOARD_PACKAGE_SUFFIX} on the first change`,
      )
      void updateWhiteboardSettings({ packagePath }).catch(() => undefined)
    }

    void loadScene()

    return () => {
      cancelled = true
      saveReadyRef.current = false
      // The outgoing canvas is gone with its package; the next one hands
      // over its own API when it mounts. The pending save already names
      // its own target, so it is flushed rather than dropped.
      apiRef.current = null
      setApi(null)
      void flushPendingSave().catch(() => undefined)
    }
  }, [flushPendingSave, packageName, packagePath, loadVersion])

  // Last-chance flush when the app tab hides or unloads.
  useEffect(() => {
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden')
        void flushPendingSave().catch(() => undefined)
    }
    const onUnload = (): void => {
      void flushPendingSave().catch(() => undefined)
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [flushPendingSave])

  const exportPng = useCallback(
    async (filename?: string): Promise<string> => {
      if (!api || api !== apiRef.current)
        throw new Error('Whiteboard canvas is not ready yet.')
      const bound = boundRef.current
      if (!bound) throw new Error('The whiteboard is still loading.')
      const elements = api
        .getSceneElements()
        .filter(element => !element.isDeleted)
      if (!elements.length) throw new Error('The whiteboard is empty.')
      const appState = api.getAppState?.() ?? {}
      // The PNG lands inside the package, so the package must exist: settle
      // any pending save, or write a never-saved board now.
      if (!pendingRef.current && !bound.persisted) {
        pendingRef.current = {
          packagePath: bound.packagePath,
          snapshot: {
            elements: api.getSceneElements(),
            appState,
            files: api.getFiles?.() ?? {},
          },
        }
      }
      await flushPendingSave()
      const safeName = sanitizeExportFileName(
        filename || boot.appSettings.lastExportName || DEFAULT_EXPORT_NAME,
      )
      const path = resolveWhiteboardExportPath(bound.packagePath, safeName)
      const blob = await exportToBlob({
        elements,
        appState: {
          exportBackground: true,
          viewBackgroundColor:
            typeof appState.viewBackgroundColor === 'string'
              ? appState.viewBackgroundColor
              : '#ffffff',
        },
        files: api.getFiles?.() ?? {},
        mimeType: 'image/png',
      } as Parameters<typeof exportToBlob>[0])
      await writeBinaryFile(path, await blobToBytes(blob))
      void updateWhiteboardSettings({ lastExportName: safeName }).catch(
        () => undefined,
      )
      setStatus(`Exported ${safeName}`)
      return path
    },
    [api, boot.appSettings.lastExportName, flushPendingSave],
  )

  const save = useCallback(async (): Promise<string> => {
    const bound = boundRef.current
    if (
      !api ||
      api !== apiRef.current ||
      !bound ||
      bound.packagePath !== packagePath ||
      !saveReadyRef.current
    )
      throw new Error('Whiteboard is still loading.')
    pendingRef.current = {
      packagePath: bound.packagePath,
      snapshot: {
        elements: api.getSceneElements(),
        appState: api.getAppState?.(),
        files: api.getFiles?.(),
      },
    }
    const expected = whiteboardSceneFingerprint(
      pendingRef.current.snapshot.elements,
      pendingRef.current.snapshot.appState,
    )
    await flushPendingSave()
    const saved = parseWhiteboardScene(
      await readTextFile(resolveWhiteboardScenePath(bound.packagePath)),
    )
    if (whiteboardSceneFingerprint(saved.elements, saved.appState) !== expected)
      throw new Error(
        'The saved whiteboard differs from the requested scene. Read it before retrying.',
      )
    await bindWhiteboardDocument(bound.packagePath)
    return bound.packagePath
  }, [api, packagePath, flushPendingSave])

  const switchDocument = useCallback((path: string): string => {
    saveReadyRef.current = false
    boundRef.current = null
    apiRef.current = null
    setApi(null)
    setLoaded(null)
    setPackagePath(path)
    setLoadVersion(value => value + 1)
    return path
  }, [])

  const create = useCallback(
    async (title: string): Promise<string> => {
      await flushPendingSave()
      const scene = createDefaultWhiteboardScene()
      const manifest = createWhiteboardPackageManifest(
        `${title}.whiteboard`,
        scene,
      )
      const { path } = await createPlatformDraft({
        appSlug: 'whiteboard',
        suffix: '.whiteboard',
        kind: 'package',
        title: title.trim() || 'Untitled whiteboard',
        files: [
          {
            name: 'whiteboard.whiteboard.json',
            content: serializeWhiteboardScene(scene),
          },
          {
            name: 'manifest.json',
            content: serializeWhiteboardPackageManifest(manifest),
          },
        ],
      })
      parseWhiteboardScene(await readTextFile(resolveWhiteboardScenePath(path)))
      await bindWhiteboardDocument(path)
      return switchDocument(path)
    },
    [flushPendingSave, switchDocument],
  )

  const open = useCallback(
    async (path: string): Promise<string> => {
      if (!path.startsWith('/') || !path.endsWith('.whiteboard'))
        throw new Error('Provide an absolute .whiteboard package path.')
      await flushPendingSave()
      parseWhiteboardScene(await readTextFile(resolveWhiteboardScenePath(path)))
      await bindWhiteboardDocument(path)
      return switchDocument(path)
    },
    [flushPendingSave, switchDocument],
  )

  // File opens share the same save/readback/binding checks as agent and UI opens.
  useEffect(() => {
    const path = resource?.path?.trim()
    if (!path) return
    void open(normalizeWhiteboardPackagePath(path, workingDirectory))
      .catch(error => setStatus(errorMessage(error)))
      .finally(onResourceHandled)
  }, [resource, onResourceHandled, workingDirectory, open])

  // The shared browser can rename/move/delete the open package. Retarget
  // pending writes immediately so no save recreates the old package path.
  useEffect(
    () =>
      onPlatformDocumentsChanged(change => {
        const bound = boundRef.current
        if (!bound) return
        if (
          change.previousPath === bound.packagePath &&
          change.path !== bound.packagePath &&
          change.kind !== 'duplicated'
        ) {
          if (pendingRef.current?.packagePath === bound.packagePath)
            pendingRef.current.packagePath = change.path
          bound.packagePath = change.path
          void open(change.path).catch(error => setStatus(errorMessage(error)))
        } else if (
          change.kind === 'deleted' &&
          change.path === bound.packagePath
        ) {
          saveReadyRef.current = false
          pendingRef.current = null
          setLoaded({
            packagePath: change.path,
            scene: null,
            error:
              'This whiteboard was deleted. Open another board from Documents.',
          })
          setStatus('Not saving')
        }
      }),
    [open],
  )

  // Shared navigation tracks the loaded package; the scene queue remains
  // the only autosave owner (no lifecycle.markDirty/flush calls).
  const lifecycle = useDocumentLifecycle({
    appSlug: 'whiteboard',
    suffix: '.whiteboard',
    kind: 'package',
    suggestedTitle: packageName,
    serialize: () => {
      const bound = boundRef.current
      const canvas = apiRef.current
      if (!bound || !canvas || !saveReadyRef.current)
        throw new Error('Whiteboard is still loading.')
      const scene = createWhiteboardSceneDocument({
        elements: canvas.getSceneElements(),
        appState: canvas.getAppState?.(),
        files: canvas.getFiles?.(),
      })
      return [
        {
          name: 'whiteboard.whiteboard.json',
          content: serializeWhiteboardScene(scene),
        },
        {
          name: 'manifest.json',
          content: serializeWhiteboardPackageManifest(
            createWhiteboardPackageManifest(
              bound.packagePath,
              scene,
              bound.manifest,
            ),
          ),
        },
      ]
    },
  })
  const adopt = lifecycle.adopt
  useEffect(() => {
    if (current?.scene) adopt(packagePath, { title: packageName })
  }, [adopt, current?.scene, packagePath, packageName])

  const showDocuments = useCallback(async () => {
    try {
      await flushPendingSave()
      setDocumentError(null)
      setSwitcherOpen(true)
    } catch (error) {
      setStatus(`Could not save: ${errorMessage(error)}`)
    }
  }, [flushPendingSave])
  const createFromBrowser = useCallback(() => {
    setDocumentError(null)
    void create('Untitled whiteboard')
      .then(() => setSwitcherOpen(false))
      .catch(error => setDocumentError(errorMessage(error)))
  }, [create])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return
      const key = event.key.toLowerCase()
      if (!['o', 'n', 's'].includes(key)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (key === 'o') void showDocuments()
      if (key === 'n') createFromBrowser()
      if (key === 's')
        void save().catch(error => setStatus(errorMessage(error)))
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [showDocuments, createFromBrowser, save])

  usePureWhiteboardAgentTools(ready, {
    isReady: () =>
      saveReadyRef.current && boundRef.current?.packagePath === packagePath,
    api: saveReadyRef.current ? api : null,
    document:
      current?.scene && boundRef.current
        ? {
            packagePath,
            scenePath: resolveWhiteboardScenePath(packagePath),
            persisted: boundRef.current.persisted,
          }
        : null,
    exportPng,
    save,
    create,
    open,
  })

  const handleChange = useCallback(
    (...args: Parameters<NonNullable<ExcalidrawProps['onChange']>>) => {
      const [elements, appState, files] = args
      const bound = boundRef.current
      if (!saveReadyRef.current || !bound) return
      const whiteboardElements = elements as readonly WhiteboardElementLike[]
      const sceneAppState = appState as unknown as Record<string, unknown>
      // Excalidraw reports every viewport and selection change too; only a
      // change to the drawing itself is worth a write.
      const fingerprint = whiteboardSceneFingerprint(
        whiteboardElements,
        sceneAppState,
      )
      if (fingerprint === fingerprintRef.current) return
      fingerprintRef.current = fingerprint
      pendingRef.current = {
        packagePath: bound.packagePath,
        snapshot: {
          elements: whiteboardElements,
          appState: sceneAppState,
          files: files as unknown as Record<string, unknown>,
        },
      }
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        flushPendingSave().catch(error => {
          setStatus(`Could not save: ${errorMessage(error)}`)
        })
      }, AUTOSAVE_DELAY_MS)
    },
    [flushPendingSave],
  )

  const handleApi = useCallback((instance: unknown) => {
    apiRef.current = instance as ExcalidrawApi
    setApi(instance as ExcalidrawApi)
  }, [])

  const handleExport = useCallback(() => {
    setStatus('Exporting...')
    exportPng().catch(error => {
      setStatus(errorMessage(error))
    })
  }, [exportPng])

  return (
    <AppFrame
      headerDocumentName={packageName}
      headerActions={
        <DocumentHeaderActions
          lifecycle={lifecycle}
          title={packageName}
          onOpenSwitcher={() => void showDocuments()}
        />
      }
    >
      <Root data-app="whiteboard">
        <Header aria-hidden="true" />
        <CanvasHost>
          {!current ? (
            <CanvasPlaceholder>Loading whiteboard</CanvasPlaceholder>
          ) : current.error ? (
            <CanvasNotice role="alert">{current.error}</CanvasNotice>
          ) : current.scene ? (
            <Excalidraw
              key={packagePath}
              excalidrawAPI={handleApi}
              initialData={
                {
                  elements: current.scene.elements,
                  appState: current.scene.appState,
                  files: current.scene.files,
                } as ExcalidrawProps['initialData']
              }
              onChange={handleChange}
            >
              <MainMenu>
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
                <MainMenu.Separator />
                <MainMenu.DefaultItems.Help />
              </MainMenu>
              <WelcomeScreen>
                <WelcomeScreen.Center>
                  <WelcomeScreen.Center.Heading>
                    Pick a tool and start sketching. Saved to {packageName}
                    {WHITEBOARD_PACKAGE_SUFFIX} as you draw.
                  </WelcomeScreen.Center.Heading>
                </WelcomeScreen.Center>
                <WelcomeScreen.Hints.ToolbarHint />
              </WelcomeScreen>
            </Excalidraw>
          ) : (
            <CanvasPlaceholder>Whiteboard unavailable</CanvasPlaceholder>
          )}
        </CanvasHost>
        <Actions>
          <Meta role="status" title={packagePath}>{status}</Meta>
          <Button type="button" disabled={!api} onClick={handleExport}>Export PNG</Button>
        </Actions>
      </Root>
      <DocumentSwitcher
        appSlug="whiteboard"
        suffixes={['.whiteboard']}
        variant="modal"
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        openError={documentError}
        onOpenDocument={async path => {
          setDocumentError(null)
          try {
            await open(path)
            setSwitcherOpen(false)
          } catch (error) {
            setDocumentError(errorMessage(error))
            throw error
          }
        }}
        onCreateNew={createFromBrowser}
        newLabel="New whiteboard"
        title="Open a whiteboard"
        itemNoun="whiteboard"
        previewStyle="structured"
      />
    </AppFrame>
  )
}
