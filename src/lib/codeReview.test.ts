import { expect, it, vi } from 'vitest'
vi.mock('@excalidraw/excalidraw', () => ({ CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY' }, convertToExcalidrawElements: vi.fn() }))
import { whiteboardSceneFingerprint, removeWhiteboardElement, type WhiteboardElementLike } from './whiteboardScene'
import { parseWhiteboardScene } from './whiteboardPackage'
const a = { id: 'a', type: 'rectangle', x: 0, y: 0, width: 20, height: 20, version: 1 }
const b = { ...a, id: 'b', version: 2 }
it('detects replacement drawings with the same version sum', () => {
  expect(whiteboardSceneFingerprint([a])).not.toBe(whiteboardSceneFingerprint([{ ...a, id: 'new' }]))
})
it('detects changed stacking order', () => {
  expect(whiteboardSceneFingerprint([a, b])).not.toBe(whiteboardSceneFingerprint([b, a]))
})
it('detects version changes whose sum cancels out', () => {
  expect(whiteboardSceneFingerprint([a, b])).not.toBe(whiteboardSceneFingerprint([{ ...a, version: 2 }, { ...b, version: 1 }]))
})
it('ignores selection and viewport-only changes', () => {
  expect(whiteboardSceneFingerprint([a], { scrollX: 1 })).toBe(whiteboardSceneFingerprint([a], { scrollX: 200, selectedElementIds: { a: true } }))
})
it('detaches surviving children from a deleted frame', () => {
  let elements: readonly WhiteboardElementLike[] = [{ ...a, type: 'frame' }, { ...b, frameId: 'a' }]
  removeWhiteboardElement({ getSceneElements: () => elements, updateScene: scene => { elements = scene.elements } }, { id: 'a' })
  expect(elements[0].id).toBe('b')
  expect(elements[0].frameId).toBeNull()
})
it('rejects unsupported scene versions', () => {
  expect(() => parseWhiteboardScene(JSON.stringify({ schemaVersion: 2, elements: [] }))).toThrow()
})
it('rejects duplicate element IDs before opening', () => {
  expect(() => parseWhiteboardScene(JSON.stringify({ elements: [a, a] }))).toThrow()
})
