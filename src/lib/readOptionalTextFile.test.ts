import { describe, expect, it } from 'vitest'
import { readOptionalTextFile } from './readOptionalTextFile'
describe('optional file reads', () => {
  it('returns content and recognizes confirmed missing files', async () => {
    expect(await readOptionalTextFile(async () => 'content', '/a')).toBe(
      'content',
    )
    expect(
      await readOptionalTextFile(async () => {
        throw new Error('ENOENT: /a')
      }, '/a'),
    ).toBeNull()
    expect(
      await readOptionalTextFile(async () => {
        throw { code: 'ENOENT' }
      }, '/a'),
    ).toBeNull()
    expect(
      await readOptionalTextFile(async () => {
        throw new Error('No such file: /Workspace/PureScience/whiteboard.whiteboard/whiteboard.whiteboard.json.')
      }, '/a'),
    ).toBeNull()
  })
  it.each(['EACCES', 'EIO', 'bridge disconnected', 'That is outside this document.'])(
    'preserves %s',
    async message => {
      await expect(
        readOptionalTextFile(async () => {
          throw new Error(message)
        }, '/a'),
      ).rejects.toThrow(message)
    },
  )
})
