# PureWhiteboard code review — 2026-09-10

Baseline: own remote main 4a38467269da53657bd5873321515393ffbc41a3, freshly fetched and matched. Source: suite app/bridge docs and app implementation. App-only changes.

## Fixed

- Autosave fingerprint includes ordered element IDs, versions, nonces and deletion state. Different drawings, reordered layers and cancelling version changes previously shared a fingerprint and could miss saving.
- Removing a frame clears surviving children's frameId references.
- Reject unsupported scene schema versions and duplicate element IDs before canvas adoption.

## Verification

Seven focused regressions passed in src/lib/codeReview.test.ts (six failed before fixes). Selection/viewport-only changes remain excluded from drawing saves. App typecheck passed. The Excalidraw import is mocked for these domain checks; no browser canvas or undo integration claim. No full suite run.

## Coverage and remaining work

Read all production TS/TSX files except small constants/types/catalog entry declarations; includes complete workspace save/load/export flow and scene tools. No exhaustive third-party Excalidraw audit.

Remaining app concerns:
- Save failure recovery uses one pending slot across packages. Retain failed snapshots per package and block switching until outgoing writes are durable.
- flushPendingSave returns early when a save is already in flight and no pending snapshot remains; export should await that in-flight write.
- beforeunload cannot guarantee completion of asynchronous writes. Integrate the existing document lifecycle for close-time flush and document switching.
- Manifest reads treat every failure as absence; preserve read/parse errors rather than silently replacing metadata.
- Standalone missing-file errors lack ENOENT, so first-run standalone initialization can show a read error.
- Scene validation does not comprehensively validate geometry, bindings or binary file records.
- getWhiteboardContext is capped at 200 without paging; add pagination/search for large scenes.
- Local CSS overrides Excalidraw internals extensively; verify narrow layouts when upgrading it.

No shell implementation changed. Remaining lifecycle integration should first use existing public APIs; any missing platform primitive requires separate documentation.
