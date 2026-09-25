import { describe, expect, it } from 'vitest'
import {
  normalizeWhiteboardPackagePath,
  resolveDefaultWhiteboardPackagePath,
  resolveWhiteboardManifestPath,
  resolveWhiteboardExportPath,
  resolveWhiteboardScenePath,
  sanitizeExportFileName,
} from './whiteboardPaths'

describe('whiteboard export paths', () => {
  it('sanitizes export names and appends png', () => {
    expect(sanitizeExportFileName('team sketch')).toBe('team_sketch.png')
    expect(sanitizeExportFileName('../unsafe?.png')).toBe('unsafe_.png')
    expect(sanitizeExportFileName('')).toBe('whiteboard.png')
    expect(sanitizeExportFileName('diagram.PNG')).toBe('diagram.PNG')
  })

  it('writes exports into the package exports folder', () => {
    expect(resolveWhiteboardExportPath('/tmp/team.whiteboard/', 'board')).toBe(
      '/tmp/team.whiteboard/assets/exports/board.png',
    )
  })

  it('resolves the default .whiteboard package in PureScience', () => {
    expect(
      resolveDefaultWhiteboardPackagePath('/Users/developer/Documents'),
    ).toBe('/Users/developer/PureScience/whiteboard.whiteboard')
  })

  it('normalizes package and scene paths', () => {
    expect(
      normalizeWhiteboardPackagePath('/tmp/team map', '/tmp/work'),
    ).toBe('/tmp/team map.whiteboard')
    expect(
      normalizeWhiteboardPackagePath(
        '/tmp/team map.whiteboard/whiteboard.whiteboard.json',
        '/tmp/work',
      ),
    ).toBe('/tmp/team map.whiteboard')
    expect(resolveWhiteboardManifestPath('/tmp/team.whiteboard')).toBe(
      '/tmp/team.whiteboard/manifest.json',
    )
    expect(resolveWhiteboardScenePath('/tmp/team.whiteboard')).toBe(
      '/tmp/team.whiteboard/whiteboard.whiteboard.json',
    )
  })
})
