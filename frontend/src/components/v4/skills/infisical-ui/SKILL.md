---
name: infisical-ui
description: Build or review the incubating Infisical v4 foundation, its workbench examples and agent guidance. Use for components, tokens, theming and design-system documentation, not product migration.
---

# Infisical UI

Start with [the v4 instructions](../../AGENTS.md), then query the affected task and read the relevant [canonical rules](rules.json). Always preserve the protected-content boundary. The workbench's Rules page reads that same file. Each rule's `detect` field says who catches a break: `lint` (enforced by `npm run ui:lint`), `test` (a named test) or `review` (a reader of the change).

## Work in order

1. Confirm the boundary. v4 is incubating and fenced from product imports. Keep product code on v3 unless a separate migration is authorized.
2. Run `npm run ui:info -- <task or component>` from frontend. Read the matching generated guide in `src/components/v4/docs/`, then actual exported props and `/design-system#<canonical-id>`. The catalog covers 78 families, including composed patterns and text/layout helpers. Family count and coverage declarations do not prove behavior or visual consistency.
3. Read `tokens.json` for source roles and `v4.css` for current runtime mappings. Do not assume the source specification and every installed primitive already match.
4. Compose the supported Radix API under React 18. Use variants and sizes before classes. On a v4 component, caller classes carry layout only. Raise missing behavior instead of inventing props or adding another implementation.
5. Verify the actual result. Typecheck and run the affected runtime tests, then lint. Use the browser for both themes, narrow layouts, long content, keyboard navigation and open portals. Report checks you did not run.

## Keep the identity

Use warm neutrals, Archivo, Geist Mono and square corners. The soft corner scale is an available mode (`V4Scope corners="soft"`); every radius goes through `var(--corners)` so both modes hold. Default, primary and accent Buttons use the shared lime material defined by rule/button-material in the canonical rules. The global primary role remains ink; do not recolor other components to match the Button. The brand neon lime is `--v4-accent` with `--v4-on-accent`; shadcn's `bg-accent` is a neutral hover/selection role. Do not swap them. For brand text or icons, the source `accent-fg` role is exposed as `--v4-accent-fg`. Do not use the light neon fill as light-theme text.

Icons come from Lucide (`lucide-react`), the source of truth. Use `Icon` with a product name or a Lucide icon, or import a Lucide icon directly; stroke follows `stroke-icon` (1.7) and size the size tokens. The original 2.0 line set in `assets/icons-legacy/` is a legacy artifact: never import it or hand-draw SVG icons.

Use `V4Scope` for the workbench boundary so portals inherit its colors, fonts and corner mode. Pass the host's resolved light/dark theme to `V4Scope`, or inherit the nearest host theme. Keep preference and storage in the host. The workbench uses its existing ThemeProvider; installed consumers use their own provider. Do not theme `document.body` or maintain a second preference state.

Protect code, commands, identifiers, protocol payloads, legal and license text, quoted material and user-entered values from prose editing. Never include real secrets in examples, logs or captures. The rules file defines the narrow exemption boundary.

## Checks

These commands belong to this repository. Run from `frontend/`:

```sh
npm run ui:check
npm run type:check
npm test
npm run lint
npm run lint:v4
```

Installed consumers receive the namespaced guidance and readable `docs/README.md`, `docs/components.json` and per-family Markdown. They do not receive this repository's npm scripts or workbench route. Read those shipped files and run the consumer's own build, tests and browser checks.

The stylesheet and runtime regressions cover specific utility, ref, state, progress, portal, focus and theme behaviors. They do not prove all visual rules, accessibility states or component APIs. Copy, hierarchy, rendered contrast and missing coverage still require review.

When adding a primitive, use the existing `components.json` and registry workflow. Do not run `shadcn init`. Check its React compatibility, required packages, support files and installation in a clean consumer before claiming it is installable. A registry JSON build alone is insufficient.

Start `npm run ui:dev` for a backend-free workbench. Human view renders real component examples. Agent view shows the exact generated per-family Markdown, including the compiled example source. Use `npm run ui:generate` after changing tokens, contracts or source dependencies, then `npm run ui:check`. Keep generated coverage separate from executed runtime, browser and clean-consumer evidence.

## Author guidance from evidence

Read the component decision before choosing a primitive. Its rules have a condition, a specific Do/Avoid pair, a reason, source-module evidence and a `detect` field. Generation checks the editorial shape, source ownership and that every `lint` rule and check in `scripts/check-v4.ts` name each other. It also fails when a shared rule's instruction, good or avoid line opens with a lowercase fragment, and when one family's guidance says the same sentence twice. A `review` rule is enforced only by whoever reads the change, so say so rather than calling it verified.

Keep design research outside shipped component source, comments and guidance. Retain primary standards and API references where they support a factual contract. Aesthetic taste is a project decision, not an accessibility claim. Apply a recommendation only when it fits the actual task and exported API. The pinned identity, exact-value contracts and protected-content boundary remain authoritative. Do not create a second policy file that competes with these contracts and rules.

Before publishing an example, inspect its actual narrow and wide rendering. Keep product labels, helper text, synthetic-data disclosure and truthful state feedback inside the specimen. Put inspection instructions in the guide. A control must perform its advertised operation; a click notification must not claim a save, test or reversal that did not happen.

A success message or toast alone does not prove the operation. Verify the changed resource or local model, or compare the exact exported or copied bytes. Bind every shortcut advertised as an available task action in its active context. Check that it invokes the action and respects typing, pending and disabled states where applicable. Explicitly labeled notation, platform, literal-plus and sequence specimens may demonstrate key syntax without registering commands. Keep those specimens distinct from available action hints; do not add meaningless handlers to make a notation comparison appear functional. Record the concrete scenario checked and any remaining limits.

## Author complete examples

Show supported variants and distinct sizes as labeled peers with the same content. Identify equal-size aliases once. Keep applicable states visible beside the default. Use the shared preview frame and labeled comparison cells. Demonstrate pending and failure directly where the API supports them. Keep meaningful component interactions working, and verify complex host orchestration in component tests. Use the actual exported component and its supported props. Do not invent size APIs, empty headings or every combination of independent props. Keep inspection coaching in Usage and rules, outside the specimen. Do not add save/reject/reset simulators, test-control toolbars or unrelated mini-apps to Human examples. Captions follow the specimen and reflect its actual state. Ordinary action buttons must not invent pressed-toggle behavior.

For data-bearing examples, use adverse synthetic content: long names, unbroken identifiers, missing values and zero, one or dense collections where applicable. Pair long text with its neighboring actions. Preserve exact copied and edited payloads. Verify the actual open overlay, focus return and recovery at wide and narrow widths in both themes, including text enlargement where it matters. Record not-applicable cases and unrun checks.

Declare each finite coverage choice against its executable example and visible label, or give a specific omission reason. Generation checks declaration and reference completeness. Source review checks parity with the exported API; browser evidence checks rendering and interaction. None substitutes for the others. Assessment labels describe work to perform, not a result already measured.

Use clear wording or separate text and layout instead of decorative dot separators in authored labels and prose. Preserve literal values, semantic list markers and supported status-dot or Chart dot APIs under the protected-content boundary.

## Keep component relationships consistent

Read the actual type and control recipes before changing measurements. The ordinary control height is 32px with the shared 14px text role. Keep explicit 36px and 40px sizes available. Their nested action boxes are 24, 28 and 32px, accounting for the host border and inset. Button default/sm are aliases; Input/InputGroup/Snippet default to sm. MultiSelect is 32px at sm and 36px at md. Standalone icon aliases are separate recipes.

A type role owns family, size, line height, weight and tracking together. Read the complete title, row-title, field-label, body, helper and technical-value roles from the source. Use the 28/32 page title for ordinary titles and the explicit 44/44 display role only when its scale is needed. Do not reconstruct a role from font size alone.

A control size also owns border-inclusive height, insets, icon box, label gap and any nested action slot. Keep component internals in their owner. Use Stack, Inline, Grid and measures for relationships between siblings. A caller padding or font patch hides a missing shared recipe and will drift in the next composition.

Compare filled and outlined actions beside fields using the same supported size. Compare nested Copy, Reveal and Clear independently from standalone icon actions. Adding an action must not enlarge a one-line host or erase the distinction between its advertised sizes. Check a pending label and long content in the same comparison. Equal outer boxes still need optical review for their text baseline and visual weight.

Keep ordinary sections open and quiet. Frame data, code or a distinct task when its boundary helps. The frame does not choose title rank. Equivalent titles keep the same role in Card, settings and plain sections, and their named header, body and footer slots own the shared content edges. Titles, counts, metadata and actions need separate slots rather than concatenated strings.

Use content-driven rows for lists and one effective uniform metric where virtualization requires it. Table and DataGrid rowHeight values are requested minimums; enlarged content can raise the shared effective height used by rendering, virtual slices and navigation. They do not support arbitrary variable-height rows. Compare the actual compiled row height with the scroll model, including nested controls and borders. A height declaration that loses to a child's minimum size is not a working virtual-row contract. Preserve row ids through reordering and keep current details separate from bulk selection.

## Write rules that change an author's decision

Start with the closest alternative. Explain why this task needs a searchable field value, pressed tool, peer panel, action menu or sequential workflow. Then read the supported props and coverage omissions. Describe the real variants and sizes without inventing another dimension to fill a comparison. A family with no named size should say so. An alias is one measurement with two supported names, not another visual size.

Use a condition that can occur in this component. Give the supported construction, the concrete mistake and its consequence. Name an assessment that could disprove the claim. For example, a virtual-row rule compares actual row height with the supplied metric while scrolling across slices. It does not merely assert that the source contains a height token. A copy rule checks the exact safe payload after fulfillment and rejection; a green toast alone proves neither.

Preserve existing specific rules that cover a different risk. Refine overlapping prose instead of adding a quota of rules or repeating the global bans in every family. Authored assessment instructions remain instructions until a recorded test or review executes them. Keep source, behavior, rendered review and clean installation evidence separate.

Human mode shows variants, supported sizes and meaningful states first. Put usage, states, accessibility, rules and anti-slop decisions together in its one initially closed Usage and rules disclosure, written as what the person sees and decides. Keep behavior, limits, API tables, source and verification instructions in Agent mode. Required help, permission reasons, synthetic-data disclosures and actual errors remain visible beside the relevant control. Remove coaching sentences that narrate what a person should click merely to inspect an example.
