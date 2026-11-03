import { mergeScenes } from './whiteboardMerge'
import {
  parseWhiteboardScene,
  serializeWhiteboardScene,
  type WhiteboardSceneDocument,
} from './whiteboardPackage'

export interface SharedScenePort {
  /** The scene file's text, or null if there is none yet. */
  read(path: string): Promise<string | null>
  /** Written only if the file's revision is still `expected`, or throws a save conflict. */
  writeIfUnchanged(path: string, sceneText: string, expected: string | null): Promise<void>
  /** A board with no package yet has nothing to compare against. */
  writeNew(path: string, sceneText: string): Promise<void>
}

const REVISION_FIELD = 'revision'
function contentHash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
/** The same drawing has the same revision: when it was saved is not a change to it. */
const revisionOf = (scene: WhiteboardSceneDocument) =>
  contentHash(JSON.stringify({ elements: scene.elements, appState: scene.appState, files: scene.files }))
const revisionIn = (text: string): string | null => {
  const value = (JSON.parse(text) as Record<string, unknown>)[REVISION_FIELD]
  return typeof value === 'string' ? value : null
}
const CONFLICT = /save conflict/i
/** A save that lost the race merges again on what the other copy wrote. Each round is someone else's save landing. */
const SAVE_ROUNDS = 8

export interface SavedScene {
  /** What is in the file now. */
  scene: WhiteboardSceneDocument
  /** It holds more than this copy gave it: put it on screen. */
  merged: boolean
}

/**
 * One board as this running copy and the file last agreed on it. A second live copy of the app (a tab, and one held inside
 * a page) writes the same file, so a save here is conditional on what this copy last saw. If the other saved first, its
 * work is merged in, shape by shape, and the merge is what gets written.
 */
export class SharedScene {
  private agreed: { path: string; scene: WhiteboardSceneDocument; revision: string | null } | null = null

  constructor(private port: SharedScenePort) {}

  /** What the file holds now is where this copy starts from. */
  bind(path: string, scene: WhiteboardSceneDocument, revision: string | null): void {
    this.agreed = { path, scene, revision }
  }
  bindText(path: string, text: string | null, scene: WhiteboardSceneDocument): void {
    this.bind(path, scene, text === null ? null : revisionIn(text))
  }
  retarget(from: string, to: string): void {
    if (this.agreed?.path === from) this.agreed = { ...this.agreed, path: to }
  }

  private async look(path: string) {
    const text = await this.port.read(path)
    return text === null ? null : { scene: parseWhiteboardScene(text), revision: revisionIn(text) }
  }

  /** As the workspace does today: the whole scene from this copy's memory, with no condition. */
  async save(path: string, scene: WhiteboardSceneDocument, _persisted: boolean): Promise<SavedScene> {
    await this.port.writeNew(path, serializeWhiteboardScene(scene))
    return { scene, merged: false }
  }

  /** As the workspace does today: only a rename or a delete is heard, never another copy's save. */
  async takeIn(_path: string, _live: () => WhiteboardSceneDocument): Promise<{ scene: WhiteboardSceneDocument; unsaved: boolean } | null> {
    return null
  }
}
