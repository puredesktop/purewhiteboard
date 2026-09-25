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
  })
  it.each(['EACCES', 'EIO', 'bridge disconnected'])(
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
