# BuildPilot design tokens

This file is the source-of-truth catalog for the semantic color tokens
defined under `theme.extend.colors.bp` in `tailwind.config.js`.

The token layer exists so a future light theme, palette tweak, or
contrast adjustment can flow through a single config change instead of
a 70-component find-and-replace. Components migrate to tokens as
they're naturally touched — the layer is **additive**, every existing
slate / sky / amber / emerald / rose utility keeps working.

## Why tokens?

- **Consistency** — three text colors instead of seven, four surface
  layers instead of "whatever felt right in this file".
- **Themeability** — light mode, high-contrast mode, alternate brand
  accent all change one config file.
- **Discoverability** — a new contributor reading `text-bp-text-muted`
  immediately knows it's the established "timestamp / hint" colour.

## Token catalog

### Brand

| Token       | Resolves to (raw class)        | Use case                                                   |
| ----------- | ------------------------------ | ---------------------------------------------------------- |
| `bp-brand`  | `sky-500` (`#0ea5e9`)          | Primary buttons, active nav state, links, focus accents     |

Usage examples:

```tsx
<button className="bg-bp-brand text-white">Submit</button>
<a className="text-bp-brand hover:underline">Learn more</a>
```

### Surfaces

| Token             | Resolves to (raw class)      | Use case                                            |
| ----------------- | ---------------------------- | --------------------------------------------------- |
| `bp-surface-0`    | `slate-950` (`#020617`)      | App shell background, page root                     |
| `bp-surface-1`    | `slate-900` (`#0f172a`)      | Primary content card, dialog body                   |
| `bp-surface-2`    | `slate-800` (`#1e293b`)      | Hover rows, secondary borders, divider lines        |
| `bp-surface-3`    | `slate-700` (`#334155`)      | Input borders, raised toolbar, button outline       |

Usage examples:

```tsx
<aside className="bg-bp-surface-0 border-r border-bp-surface-2" />
<input className="bg-bp-surface-0 border border-bp-surface-3" />
```

### Text hierarchy

| Token                  | Resolves to (raw class)    | Use case                                            |
| ---------------------- | -------------------------- | --------------------------------------------------- |
| `bp-text-primary`      | `slate-100` (`#f1f5f9`)    | Body copy, primary labels, active item labels       |
| `bp-text-secondary`    | `slate-300` (`#cbd5e1`)    | Sub-labels, inline icons, secondary buttons         |
| `bp-text-muted`        | `slate-400` (`#94a3b8`)    | Timestamps, hint text, disabled-but-readable rows   |

Usage examples:

```tsx
<h1 className="text-bp-text-primary">Build #1234</h1>
<span className="text-bp-text-muted">2 minutes ago</span>
```

### Status

| Token         | Resolves to (raw class)    | Use case                                                |
| ------------- | -------------------------- | ------------------------------------------------------- |
| `bp-success`  | `emerald-400` (`#34d399`)  | Successful build dots, success pills, "OK" icons        |
| `bp-warning`  | `amber-400` (`#fbbf24`)    | Pending approvals, warnings, history icon accent        |
| `bp-error`    | `rose-400` (`#f87171`)     | Failed builds, destructive buttons, error pills         |
| `bp-info`     | `sky-400` (`#38bdf8`)      | Informational hints, "What's new" sparkles, info pills  |

Usage examples:

```tsx
<span className="h-2 w-2 rounded-full bg-bp-success" />
<button className="bg-bp-error text-white">Delete</button>
```

## Migration status

The token layer is **additive**. Both `text-slate-100` and the
equivalent `text-bp-text-primary` resolve to the same colour today, so
mixing the two during the transition is safe.

Migrated components (use the `bp-*` aliases for status + surface
classes):

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/LogTable.tsx`
- `apps/web/src/components/Breadcrumb.tsx`
- `apps/web/src/components/FailureSummaryCard.tsx`
- `apps/web/src/components/ConfirmDialog.tsx`

Every other component still uses the raw `slate-*` / `sky-*` / etc.
utilities. They will migrate when they're naturally touched for another
reason — no big-bang refactor.

## Rules

- **Don't** introduce `@apply` rules or component-CSS classes layered
  on top of the tokens. Stick to utility classes so devtools can show
  the resolved palette at a glance.
- **Don't** add a new semantic token unless at least two unrelated
  components want it — otherwise the abstraction earns less than it
  costs.
- **Do** prefer the semantic name (`bp-success`) over the literal palette
  (`emerald-400`) in any newly-written component.
