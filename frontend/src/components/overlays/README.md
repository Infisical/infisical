# Overlay layering

The semantic tokens in `src/index.css` own document-level stacking. Numeric
values are private to that token table. Components use `z-layer-*` utilities;
style-based adapters use the matching CSS variable.

| Role | Utility | Owner |
| --- | --- | --- |
| Page chrome | `z-layer-chrome` | Navigation and sticky page UI |
| Floating action bar | `z-layer-action` | Selected-action bar |
| Backdrop | `z-layer-backdrop` | Inside a modal host |
| Modal/sheet content | `z-layer-content` | Inside a modal host |
| Floating control | `z-layer-floating` | Select, menu, popover, hover card |
| Tooltip | `z-layer-tooltip` | Annotation above its owning controls |
| Modal host | `z-layer-modal` | Dialog, AlertDialog, Sheet, v2 Modal/Drawer |
| Toast host | `z-layer-toast` | Global Sonner instance and toast-owned overlays |

Backdrop/content and chrome/action roles share values because they belong to
different stacking contexts. The small, spaced values express ordering only;
they do not allocate numeric ranges to nesting depth.

## Ownership and repeated nesting

`ModalLayer` maintains the existing controlled or uncontrolled open contract. On
open, it appends an isolated, viewport-sized host to the owning portal container
(or `document.body` at the top level). `LayerPortal` sends the library's backdrop
and content into that host. `LayerContent` separates Radix's untransformed
focus/aria/scroll scope from the visual panel, and provides that scope to
descendants as their default portal destination. The host has no transform, containment, overflow clipping,
or pointer target of its own.

Menus, selects, popovers, and tooltips portal beside the scrollable panel,
inside its interaction scope. Portal descendants wait for that scope to mount,
so initially open children never briefly attach to the body and inherit stale
`aria-hidden` state. This keeps input focus, assistive-technology
visibility, and wheel/touch scrolling under the owning dialog's control. A nested modal gets another isolated host inside its parent's
host. Its backdrop covers the entire parent composition, including tooltips.
This works repeatedly without multiplying z-index values. Sibling modal hosts
follow opening order, including when an earlier root reopens. Independent
modal roots should be siblings in the React tree when they represent
independent tasks; a descendant modal is owned by its ancestor and closes with
it.

The app root and Storybook canvas are isolated so local sticky cells and controls
cannot compete with document-level portals. Local layering inside those
boundaries stays local; do not mass-replace table headers, resize handles,
editor decorations, graph nodes, or badges.

Radix and Base UI still own focus, dismissal, keyboard handling, and presence.
The host stays connected until exiting portal children are gone. An inert
visibility animation on the interaction scope preserves the panel's exit
duration without creating a transform or clipping boundary. Force-mounted
Radix portals retain their host even while the root is closed. Floating
components retain their existing open state and DOM order behavior; a submenu
portals into the same owning scope to escape menu clipping.

## Portal containers and third-party controls

Use the default owner-aware portal destination for ordinary product UI.
`usePortalContainer` is the adapter for ReactSelect and Base UI. ReactSelect
uses fixed menu positioning and restores pointer events on the menu portal.
Tooltips in its options inherit the same owner and sit above the menu.

Existing explicit container APIs remain supported for bounded embeddings.
An explicit container changes the stacking and clipping boundary: callers must
supply an unclipped container in the intended owner. In particular, targeting
`document.body` from inside a modal bypasses ownership, and targeting a
transformed/scrolling content element does not guarantee viewport escape. Do
not use either as a workaround for a missing layer. Passing `null` to a
ReactSelect portal target keeps its existing library behavior; Base UI's null
container falls back to the owner-aware default.

A toast host always mounts at document level. Sonner uses the content layer
inside it; a toast-owned tooltip uses the tooltip layer, and a dialog launched
from a toast owns a modal host inside the toast plane. Ordinary application
modals do not cover notifications. Toast pointer interaction and the existing
outside-interaction guards remain intact.

## Remediation ledger

| Boundary | Disposition |
| --- | --- |
| v3 Dialog, AlertDialog, Sheet; v2 Modal, Drawer | Shared owned host; equivalent backdrop/content ordering. Drawer no longer splits its backdrop below page controls. |
| v3/v2 selects, dropdowns/submenus, popovers, hover cards, tooltips | Semantic roles and owner-aware portals; existing APIs preserved. |
| v3 Combobox and both generations of ReactSelect/CreatableSelect | Owner-aware adapter; no numeric menu-portal escalation. |
| Secret scanning legacy modal; Upgrade Plan; Vault import; toast error/validation dialogs | Remove lowered/raised content and backdrop overrides. |
| Access/secret approval menus, popovers, hover cards; gateway and role pickers; PKI alert menu; recording picker; identity-token and GitHub integration menus | Remove numeric content overrides. |
| Navbar notification dropdown and tooltip | Remove 999/1000; use ordinary floating/tooltip layers below modal hosts. |
| Toast copy tooltip | Remove max-integer override; inherit the toast host. |
| v2/v3 secret-input popovers, secret-path input, PKI host-command suggestions | Adapt direct Radix portals without changing their editing behavior. |
| Additional-privilege editors, GCP sync fields, alert recipients, audit-stream products, workflow integrations, webhook form | Remove explicit dialog-node/ref plumbing; shared owner escapes the scroll container. |
| Selected-action bar | Semantic action layer; owner-aware destination. |
| Secret rotation create flow, Secret Detail Drawer overrides, Compare Environments extreme value | The old implementations/overrides are absent at this baseline; no replacement-only edits. Existing shared consumers receive the foundation. |

### Retained component-local stacking

The following values are not document-level portal escapes:

- Sticky table headers, DataGrid search/resize handles, verification-code
  decoration, graph node ordering, and scroll fades stay in their local context.
- AccessTree's expanded/undocked graph is an in-page visualization, despite its
  historical `Modal` view-mode name. Its local stacking stays inside the app.
- PAM data-explorer context menus and audit-search suggestion panels remain
  page-local. A future clipping fix should use the shared floating contract.
- Authentication and secret-migration loading masks, the legacy password
  generator, and the public share card retain their in-page ordering. They do
  not receive authority to cover independently portalled modals or toasts.

These exceptions end when their containing composition is migrated or its
portal boundary changes; they are not examples for new document-level values.

## Enforcement and verification

The `layers/semantic` ESLint rule rejects numeric classes/styles on known overlay
content and numeric ReactSelect menu-portal styles. It also rejects new extreme
numeric classes or z-index styles above the historical local maximum, including
important and arbitrary-class syntax. It permits ordinary local stacking.
Dynamic runtime strings and external-library CSS still require review.

Run `npm run test:layers` for the focused DOM lifecycle tests, Tailwind utility
compilation, and lint-rule cases. DOM tests check ownership, open order, cleanup,
focus return, explicit containers, and force mounting; they cannot prove paint,
layout, or real pointer/keyboard behavior.

Storybook's **Foundations / Overlay Layering** provides Dialog, scrollable Sheet,
legacy Modal/Drawer, ReactSelect option tooltip, nested confirmation, repeated
nesting, and toast-action compositions. Check each at laptop and narrow widths,
with pointer and keyboard input, Escape, outside interaction, focus return, and
scrolling near the bottom of the container.

Application acceptance covers Additional Privileges, secret scanning and
rotation creation, Upgrade Plan from a legacy modal, Secret Detail menus,
access-request sheets, navbar notifications, toast error/validation details,
and Compare Environments selection. These remain separate from static/DOM
checks and require a running application and explicit rendered-test scope.

## Rollback

Revert the foundation, primitive adapters, and call-site removals together.
Restoring only numeric defaults or only removing hosts reintroduces generation
inversions. No persisted data, API contracts, environment variables, or database
migrations are involved.
