# purewhiteboard contribution roadmap

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep Excalidraw as the drawing surface, editable .whiteboard packages and the existing app-agent integration.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **Export a PNG with a transparent background.** Expose a transparent-background choice in the app's PNG export flow using Excalidraw's existing export option, without altering the board background.
   <!-- contribution: {"id": "png-background-option", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/png-background-option.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/png-background-option.md)

2. **Preview the PNG filename.** Show the sanitized PNG filename before saving so users can correct an unexpected default without renaming the board.
   <!-- contribution: {"id": "export-filename-preview", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/export-filename-preview.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/export-filename-preview.md)

3. **See when your board was last saved.** Extend the existing save status with the exact last successful save time while keeping unsaved or failed states distinct.
   <!-- contribution: {"id": "save-timestamp-detail", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/save-timestamp-detail.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/save-timestamp-detail.md)

4. **Read long board names.** Keep long package names readable through truncation plus a full-name tooltip, without pushing header actions off screen.
   <!-- contribution: {"id": "board-title-overflow-handling", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/board-title-overflow-handling.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/board-title-overflow-handling.md)

5. **Choose between a picture and an editable board.** Add a brief explanation in export help that PNG shares the picture while the .whiteboard package preserves editable elements and embedded assets.
   <!-- contribution: {"id": "png-versus-editable-board-guidance", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/png-versus-editable-board-guidance.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/png-versus-editable-board-guidance.md)

## More improvements

6. **Choose an image export scale.** Offer a small set of export scale choices and show the resulting pixel dimensions before rendering through the existing export API.
   <!-- contribution: {"id": "png-scale-choice", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/png-scale-choice.md"} -->
   [Medium · Implementation brief](docs/contributions/png-scale-choice.md)

7. **Choose before replacing an exported image.** Detect an existing output filename and offer an explicit replacement or different name before writing the PNG.
   <!-- contribution: {"id": "export-overwrite-clarity", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/export-overwrite-clarity.md"} -->
   [Medium · Implementation brief](docs/contributions/export-overwrite-clarity.md)

8. **Find your exported image.** After export, show the saved path and an open-location action when supported by the host, alongside the existing success status.
   <!-- contribution: {"id": "export-destination-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/export-destination-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/export-destination-feedback.md)

9. **Understand why an empty board cannot export.** Explain that the board has no visible elements when PNG export cannot proceed, rather than showing a generic failure.
   <!-- contribution: {"id": "empty-export-explanation", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/empty-export-explanation.md"} -->
   [Small · Implementation brief](docs/contributions/empty-export-explanation.md)

10. **See export progress.** Keep the export button disabled during a render and show a clear completion or failure state to avoid repeated exports.
   <!-- contribution: {"id": "export-progress-state", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/export-progress-state.md"} -->
   [Medium · Implementation brief](docs/contributions/export-progress-state.md)

11. **Retry saving the current canvas.** Expose an explicit retry after a package write failure and keep the current canvas snapshot intact until it succeeds.
   <!-- contribution: {"id": "save-retry-action", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/save-retry-action.md"} -->
   [Medium · Implementation brief](docs/contributions/save-retry-action.md)

12. **Know whether edits saved before switching boards.** Show when pending changes are being saved during a board switch and identify the board if that save fails.
   <!-- contribution: {"id": "board-switch-save-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/board-switch-save-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/board-switch-save-feedback.md)

13. **Understand a board-opening error.** Distinguish a missing manifest, invalid scene data and unreadable file in the open-board error message.
   <!-- contribution: {"id": "package-open-diagnostics", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/package-open-diagnostics.md"} -->
   [Medium · Implementation brief](docs/contributions/package-open-diagnostics.md)

14. **Find a missing embedded image.** Name missing or unreadable image assets when restoring a board and preserve the remaining editable scene.
   <!-- contribution: {"id": "missing-embedded-image-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/missing-embedded-image-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/missing-embedded-image-feedback.md)

15. **Return to the canvas after a dialog.** Return keyboard focus to the drawing surface after open or export dialogs close, preserving Excalidraw's own keyboard behavior.
   <!-- contribution: {"id": "canvas-focus-after-dialogs", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/canvas-focus-after-dialogs.md"} -->
   [Medium · Implementation brief](docs/contributions/canvas-focus-after-dialogs.md)

16. **Find header actions with the keyboard.** Provide clear keyboard focus indicators and descriptive accessible labels for the app-owned document and export controls.
   <!-- contribution: {"id": "header-action-focus-styles", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/header-action-focus-styles.md"} -->
   [Small · Implementation brief](docs/contributions/header-action-focus-styles.md)

17. **Use document actions in a narrow window.** Allow document controls and export actions to wrap cleanly in a narrow app pane while leaving maximum space for the canvas.
   <!-- contribution: {"id": "narrow-window-header-layout", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/narrow-window-header-layout.md"} -->
   [Medium · Implementation brief](docs/contributions/narrow-window-header-layout.md)

18. **Keep header controls readable across themes.** Keep app-owned header and status colours readable when switching the host theme without overriding colours intentionally used in the drawing.
   <!-- contribution: {"id": "theme-transition-consistency", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/theme-transition-consistency.md"} -->
   [Medium · Implementation brief](docs/contributions/theme-transition-consistency.md)

19. **Understand when the board is ready for the agent.** Explain whether the canvas is loading, no board is open or document binding is pending when an agent operation cannot yet run.
   <!-- contribution: {"id": "agent-readiness-explanation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/agent-readiness-explanation.md"} -->
   [Medium · Implementation brief](docs/contributions/agent-readiness-explanation.md)

20. **Locate overlapping text.** Include element labels or text snippets in the existing text-overlap feedback so users can locate the reported pair on a busy board.
   <!-- contribution: {"id": "overlap-report-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/overlap-report-context.md"} -->
   [Medium · Implementation brief](docs/contributions/overlap-report-context.md)

21. **Export selected elements as an image.** Add an explicit Selection / Whole board choice to PNG export. Include bound arrows and required image assets, preview the export bounds, and leave the editable scene unchanged.
   <!-- contribution: {"id": "export-selected-elements-as-an-image", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/export-selected-elements-as-an-image.md"} -->
   [Large · Implementation brief](docs/contributions/export-selected-elements-as-an-image.md)

## References

- [Contribution brief index](docs/contributions/README.md)
- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Contributing](CONTRIBUTING.md)
