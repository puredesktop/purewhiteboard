import { expect, it } from 'vitest'
import { assertWhiteboardTarget } from './agentDocumentIdentity'
it('refuses writes after a tab reload changes its document', () => {
  expect(() =>
    assertWhiteboardTarget('/draft.whiteboard', '/default.whiteboard'),
  ).toThrow('whiteboard changed')
})
it('requires evidence of the intended target', () => {
  expect(() =>
    assertWhiteboardTarget(undefined, '/default.whiteboard'),
  ).toThrow('packagePath is required')
  expect(() => assertWhiteboardTarget('/draft.whiteboard', undefined)).toThrow(
    'whiteboard changed',
  )
})
it('accepts the inspected document', () => {
  expect(() =>
    assertWhiteboardTarget('/draft.whiteboard', '/draft.whiteboard'),
  ).not.toThrow()
})
