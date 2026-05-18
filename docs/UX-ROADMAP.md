# BuildPilot UX Roadmap

Living document of UI / UX work, broken down by cluster. Tick boxes
get flipped to `[x]` and annotated with the short commit sha when the
item ships.

## Cluster 10.B — Pipeline editor power features

Power-user affordances for the React-Flow-based pipeline editor at
`apps/web/src/components/PipelineEditor.tsx`.

- [x] Minimap (React Flow ships `<MiniMap />` — add it with a toggle in the editor toolbar) — `2d3e92f`
- [x] Undo / redo stack — keyboard `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`; snapshot nodes+edges after each mutation — `fb69f68`
- [x] Multi-select + bulk edit — Shift+click or drag-rectangle; side panel applies common fields (host, continueOnError, retry policy) to all — `2c54d18`
- [x] Auto-layout button using `dagre` (add as dep) — tidies the graph — `67f48a7`
- [x] Inline validation badges — red dot on nodes with missing required fields (use step-registry field schemas) — `0d0075c`
- [x] Palette node preview on hover — card showing required + optional fields — `f7b38ab`
- [x] Edge condition icons + tooltip — render success/failure/always as colored icons on edges — `765c628`
- [x] Right-click context menu on a node — Run from here / Clone / Delete / Copy / Disable — `74c5b14`
- [x] Find / replace within a pipeline — `Cmd/Ctrl+F` searches node ids, types, field values — `20901d8`
- [x] Copy / paste nodes across pipelines — clipboard-backed, re-ids on paste — `748e461`
- [x] Disable / skip flag on a node — visually grays out, engine treats as no-op (UI only for now; add a TODO comment for engine support) — `e57c7b0`
- [ ] Group / lane visualization — colored swimlane backgrounds (stretch)

### Follow-ups

- **Engine support for `data.disabled`**: today the flag is UI-only. The
  pipeline runner in `apps/server/` needs to treat a step with
  `data.disabled === true` as a no-op (skip exec, mark status as
  `skipped`, propagate down success-edges). Search for the TODO(engine)
  comments in `apps/web/src/components/StepNode.tsx` and
  `apps/web/src/components/StepPropertyPanel.tsx`.
- **Group / lane visualization (item 12)**: skipped — current pipelines
  in BuildPilot are flat enough that swimlanes wouldn't pull their
  weight. Revisit if users start grouping steps by host / OS.
