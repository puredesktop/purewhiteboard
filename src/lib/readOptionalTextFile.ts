/** Only a confirmed missing file may become an empty document. */
export async function readOptionalTextFile(
  read: (path: string) => Promise<string>,
  path: string,
): Promise<string | null> {
  try {
    return await read(path)
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined
    const message = error instanceof Error ? error.message : String(error)
    if (code === 'ENOENT' || /\bENOENT\b/.test(message)) return null
    throw error
  }
}
