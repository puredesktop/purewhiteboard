/** Drawing calls must name the document they inspected, even after a reload. */
export function assertWhiteboardTarget(
  expected: unknown,
  actual: string | undefined,
): void {
  if (typeof expected !== 'string' || !expected.trim()) {
    throw new Error(
      'packagePath is required. Read getWhiteboardContext and pass its document.packagePath.',
    )
  }
  if (expected.trim() !== actual) {
    throw new Error(
      `The whiteboard changed: requested ${expected}, current ${
        actual ?? 'none'
      }. Open the intended package before editing.`,
    )
  }
}
