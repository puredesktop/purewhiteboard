import type { WhiteboardSceneDocument } from './whiteboardPackage'
import type { WhiteboardElementLike } from './whiteboardScene'

type Element = WhiteboardElementLike
const byId = (elements: readonly Element[]) => new Map(elements.map(element => [element.id, element]))
const newer = (one: Element, two: Element): Element => {
  const a = one.version ?? 0, b = two.version ?? 0
  if (a !== b) return a > b ? one : two
  return (one.versionNonce ?? 0) <= (two.versionNonce ?? 0) ? one : two
}

/**
 * Two copies' work on one board, shape by shape. Excalidraw counts every change to a shape, so where both have one the
 * higher count wins. One the other side no longer has was removed there, unless this side has changed it since they last
 * agreed: an edit beats a removal, so nothing somebody just worked on disappears. Shapes the other side added go after the
 * shape they came after there, keeping how they stack.
 */
export function mergeScenes(
  base: WhiteboardSceneDocument,
  local: WhiteboardSceneDocument,
  remote: WhiteboardSceneDocument,
): WhiteboardSceneDocument {
  const inBase = byId(base.elements), inLocal = byId(local.elements), inRemote = byId(remote.elements)
  const removedElsewhere = (element: Element) => {
    const was = inBase.get(element.id)
    return was !== undefined && (was.version ?? 0) >= (element.version ?? 0)
  }
  const elements: Element[] = []
  for (const element of local.elements) {
    const there = inRemote.get(element.id)
    if (there) elements.push(newer(element, there))
    else if (!removedElsewhere(element)) elements.push(element)
  }
  remote.elements.forEach((element, index) => {
    if (inLocal.has(element.id) || removedElsewhere(element)) return
    const before = index > 0 ? remote.elements[index - 1]!.id : null
    const at = before === null ? 0 : elements.findIndex(entry => entry.id === before) + 1
    elements.splice(before !== null && at === 0 ? elements.length : at, 0, element)
  })
  const same = (one: unknown, two: unknown) => JSON.stringify(one) === JSON.stringify(two)
  return {
    ...local,
    elements,
    appState: same(base.appState, local.appState) ? remote.appState : local.appState,
    files: { ...remote.files, ...local.files },
  }
}
