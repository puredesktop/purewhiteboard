# purewhiteboard roadmap

## Scope

Keep Excalidraw as the drawing surface, editable .whiteboard packages and the existing app-agent integration.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **PNG background option.** Expose a transparent-background choice in the app's PNG export flow using Excalidraw's existing export option, without altering the board background.

2. **PNG scale choice.** Offer a small set of export scale choices and show the resulting pixel dimensions before rendering through the existing export API.

3. **Export filename preview.** Show the sanitized PNG filename before saving so users can correct an unexpected default without renaming the board.

4. **Export overwrite clarity.** Detect an existing output filename and offer an explicit replacement or different name before writing the PNG.

5. **Export destination feedback.** After export, show the saved path and an open-location action when supported by the host, alongside the existing success status.

6. **Empty export explanation.** Explain that the board has no visible elements when PNG export cannot proceed, rather than showing a generic failure.

7. **Export progress state.** Keep the export button disabled during a render and show a clear completion or failure state to avoid repeated exports.

8. **Save timestamp detail.** Extend the existing save status with the exact last successful save time while keeping unsaved or failed states distinct.

9. **Save retry action.** Expose an explicit retry after a package write failure and keep the current canvas snapshot intact until it succeeds.

10. **Board switch save feedback.** Show when pending changes are being saved during a board switch and identify the board if that save fails.

11. **Package open diagnostics.** Distinguish a missing manifest, invalid scene data and unreadable file in the open-board error message.

12. **Missing embedded image feedback.** Name missing or unreadable image assets when restoring a board and preserve the remaining editable scene.

13. **Board title overflow handling.** Keep long package names readable through truncation plus a full-name tooltip, without pushing header actions off screen.

14. **Canvas focus after dialogs.** Return keyboard focus to the drawing surface after open or export dialogs close, preserving Excalidraw's own keyboard behavior.

15. **Header action focus styles.** Provide clear keyboard focus indicators and descriptive accessible labels for the app-owned document and export controls.

16. **Narrow window header layout.** Allow document controls and export actions to wrap cleanly in a narrow app pane while leaving maximum space for the canvas.

17. **Theme transition consistency.** Keep app-owned header and status colours readable when switching the host theme without overriding colours intentionally used in the drawing.

18. **Agent readiness explanation.** Explain whether the canvas is loading, no board is open or document binding is pending when an agent operation cannot yet run.

19. **Overlap report context.** Include element labels or text snippets in the existing text-overlap feedback so users can locate the reported pair on a busy board.

20. **PNG versus editable-board guidance.** Add a brief explanation in export help that PNG shares the picture while the .whiteboard package preserves editable elements and embedded assets.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/components/WhiteboardWorkspace.tsx)
