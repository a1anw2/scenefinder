---
description: TypeScript standards — typing, exports, and structure (see code-structure.mdc for limits)
globs: /**/*.{ts,tsx}
alwaysApply: true
---

# TypeScript

- Use strict typing: no `any`, no non-null assertions, and no unchecked casts.
- Use named exports only.
- Use `import type` for type-only imports.
- Add explicit return types for exported functions and components.
- Prefer early returns to reduce nesting and complexity.

# Code structure (non-negotiable)

These limits apply **while you write code**, not only at pre-commit. If a change would violate them, **split or extract first**, then continue the feature.

## Hard limits

| Limit | Value | Exception |
|-------|-------|-----------|
| File length | **≤ 400 lines** | `src/backend/db/open-crm-db.ts` (schema migrations stay in one file) |
| Function length | **≤ 40 lines** (exported or significant logic) | — |

**Proactive gate:** When a file you are editing is already **~350 lines**, stop growing it inline. Extract helpers, hooks, or subcomponents **in the same change** before adding more logic.

## Line-1 purpose comment (every `.ts` / `.tsx`)

Every new file — and any file you touch whose header is missing or stale — must start with:

```ts
/** Brief description of what this file does. */
```

- Line **1**, before imports.
- One sentence, present tense, no filename restatement.
- Examples: `src/frontend/src/hooks/useMediaLibraryInfinite.ts`, `src/backend/lib/shopify/shopify-mapper.ts`.

## When to split (do not wait for precheck)

Split when **any** of these are true:

- File would exceed 400 lines after your edit.
- You are adding a second major responsibility (e.g. SQL + UI + types in one file).
- A function would exceed 40 lines and is not a thin route/controller handler.
- A React page, drawer, or store module is accumulating state + markup + fetch logic together.

## Barrel re-exports (preserve import paths)

When splitting an existing module, leave the **original filename** as a thin barrel so callers do not break:

```ts
/** Original module — re-exports split implementation. */
export { listContacts, getContact } from './crm-contact-read-store.js'
export type { ContactSortBy } from './crm-contact-list-store.js'
```

Prefer this over updating dozens of importers in the same feature branch.

## Patterns already in the repo (copy these)

- Types: `src/shared/crm-file-types.ts` + barrel `crm-types.ts`
- CRM stores: `crm-contact-list-store.ts`, `crm-contact-read-store.ts`, …
- Shopify: `shopify-reporting-orders.ts`, `shopify-order-store.ts`, …
- Studio UI: `MediaLibrarySocialUsageSection.tsx`, `CollectionGalleryLightboxBar.tsx`
- Hooks: `useMediaLibraryDetailDrawer.ts` + `use-media-library-detail-drawer-types.ts`

## Agent checklist (end of every implementation task)

Before marking work done on TS/TSX changes, confirm:

1. No touched file exceeds 400 lines
2. No new/changed file lacks a line-1 purpose comment.
3. No new function in touched files exceeds 40 lines without extraction.

If you cannot finish the feature without violating a limit, **split first** and say what you split in the summary.
