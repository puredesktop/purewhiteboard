import { describe, expect, it } from 'vitest'
import {
  createWhiteboardPackageManifest,
  createWhiteboardSceneDocument,
  parseWhiteboardPackageManifest,
  parseWhiteboardScene,
  serializeWhiteboardPackageManifest,
  serializeWhiteboardScene,
} from './whiteboardPackage'

describe('whiteboard package', () => {
  it('serializes scene documents', () => {
    const scene = createWhiteboardSceneDocument({
      elements: [
        {
          id: 'a',
          type: 'rectangle',
          x: 10,
          y: 20,
          width: 100,
          height: 80,
        },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    })

    expect(parseWhiteboardScene(serializeWhiteboardScene(scene))).toMatchObject(
      {
        schemaVersion: 1,
        type: 'whiteboard.scene',
        elements: [{ id: 'a', type: 'rectangle' }],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      },
    )
  })

  it('drops deleted tombstones from the saved scene', () => {
    const scene = createWhiteboardSceneDocument({
      elements: [
        { id: 'kept', type: 'rectangle', x: 0, y: 0 },
        { id: 'gone', type: 'ellipse', x: 0, y: 0, isDeleted: true },
      ],
    })
    expect(scene.elements.map(element => element.id)).toEqual(['kept'])
  })

  it('adopts a package manifest written by PureFiles', () => {
    const manifest = parseWhiteboardPackageManifest(
      JSON.stringify({
        schemaVersion: 1,
        type: 'ps.document',
        title: 'Auth flow',
        contentFile: 'whiteboard.whiteboard.json',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )
    expect(manifest).toMatchObject({
      appId: 'purewhiteboard',
      kind: 'whiteboard',
      name: 'Auth flow',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(parseWhiteboardPackageManifest('[]')).toBeNull()
  })

  it('strips runtime-only collaborators from scene app state', () => {
    const scene = createWhiteboardSceneDocument({
      elements: [],
      appState: {
        collaborators: new Map([['user-1', { username: 'Ada' }]]),
        viewBackgroundColor: '#ffffff',
      } as unknown as Record<string, unknown>,
    })

    expect(scene.appState).toEqual({ viewBackgroundColor: '#ffffff' })
    expect(
      parseWhiteboardScene(
        JSON.stringify({
          schemaVersion: 1,
          type: 'whiteboard.scene',
          elements: [],
          appState: {
            collaborators: {},
            viewBackgroundColor: '#ffffff',
          },
        }),
      ).appState,
    ).toEqual({ viewBackgroundColor: '#ffffff' })
  })

  it('creates a .whiteboard manifest', () => {
    const scene = createWhiteboardSceneDocument({ elements: [] })
    const manifest = createWhiteboardPackageManifest(
      '/tmp/team-map.whiteboard',
      scene,
    )

    expect(
      parseWhiteboardPackageManifest(
        serializeWhiteboardPackageManifest(manifest),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      appId: 'purewhiteboard',
      slug: 'whiteboard',
      kind: 'whiteboard',
      name: 'team-map',
      sceneFile: 'whiteboard.whiteboard.json',
    })
  })
})

it.each(['null', '[]', '{}', '{"elements":[null]}', '{"elements":"bad"}'])(
  'rejects invalid scene structure: %s',
  raw => {
    expect(() => parseWhiteboardScene(raw)).toThrow()
  },
)
