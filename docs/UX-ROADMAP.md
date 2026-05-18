# BuildPilot UX Roadmap

Living document of UI / UX work, broken down by cluster. Tick boxes
get flipped to `[x]` and annotated with the short commit sha when the
item ships.

## Cluster 10.B — Pipeline editor power features

Power-user affordances for the React-Flow-based pipeline editor at
`apps/web/src/components/PipelineEditor.tsx`.

- [x] Minimap (React Flow ships `<MiniMap />` — add it with a toggle in the editor toolbar) — `2d3e92f`
- [ ] Undo / redo stack — keyboard `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`; snapshot nodes+edges after each mutation
- [ ] Multi-select + bulk edit — Shift+click or drag-rectangle; side panel applies common fields (host, continueOnError, retry policy) to all
- [ ] Auto-layout button using `dagre` (add as dep) — tidies the graph
- [ ] Inline validation badges — red dot on nodes with missing required fields (use step-registry field schemas)
- [ ] Palette node preview on hover — card showing required + optional fields
- [ ] Edge condition icons + tooltip — render success/failure/always as colored icons on edges
- [ ] Right-click context menu on a node — Run from here / Clone / Delete / Copy / Disable
- [ ] Find / replace within a pipeline — `Cmd/Ctrl+F` searches node ids, types, field values
- [ ] Copy / paste nodes across pipelines — clipboard-backed, re-ids on paste
- [ ] Disable / skip flag on a node — visually grays out, engine treats as no-op (UI only for now; add a TODO comment for engine support)
- [ ] Group / lane visualization — colored swimlane backgrounds (stretch)

### Follow-ups

(populated by agents as they hit items that need work outside this
cluster's owned files)
