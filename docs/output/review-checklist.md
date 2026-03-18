# Human Review Checklist

## Screenshot Placeholders
- [ ] **[Screenshot: Secret sidebar showing version history]** — Secret sidebar with multiple versions listed, latest version highlighted at the top. Location: "How secret versioning works during rotation" section.
- [ ] **[Screenshot: Secret Manager dashboard with sidebar open]** — Dashboard with a secret row selected, secret sidebar opening on the right. Location: "Rotate a secret through the Infisical UI" section, after step 4.
- [ ] **[Screenshot: Secret sidebar after saving]** — Sidebar showing new version number at the top of the version history. Location: "Rotate a secret through the Infisical UI" section, after step 6.

## Diagram Placeholders
None.

## VERIFY / UNKNOWN Flags
- [ ] **[ASSUMED]** — The exact UI steps for editing a secret value are inferred from the secret versioning documentation and project drawer references. Verify the click-by-click flow matches the current UI.
- [ ] **[UNKNOWN]** — Whether webhook or event notifications exist that fire when a secret is rotated. If they do, add a mention in the "How applications retrieve the updated secret" section.
- [ ] **[UNKNOWN]** — Exact CASL permission names required for secret write access. Consider adding specific permission names to the Prerequisites section.

## LINK NEEDED Flags
- [ ] **[LINK NEEDED: automated secret rotation overview]** — The page at `/documentation/platform/secret-rotation/overview` was deleted on the current branch. Replace with the correct URL once the automated rotation docs are recreated or redirected.

## REVIEW Items
None from the editorial pass. Draft was approved on first pass.

---

# Pipeline Summary

## Agents Invoked
1. **Research Agent** — Gathered technical details from 5 parallel sub-agents covering: rotation docs (git history), secret versioning code, CLI commands, API endpoints, and application retrieval methods.
2. **Structure Agent** — Classified as a single how-to guide with 11 sections. No doc split needed.
3. **Writing Agent** — Produced the full draft following the outline.
4. **Linking Agent** — Validated all 12 internal links. 11 confirmed, 1 flagged as `[LINK NEEDED]` (deleted rotation overview page). Added inline links in the retrieval methods table.
5. **Editorial Agent** — Approved on first pass. Two minor suggestions applied (adding inline links to retrieval table entries).
6. **Titling Agent** — Generated frontmatter with title "Rotate secrets", slug "rotate-secrets".

## Revision Loops
**0** — Draft approved on the first editorial pass. No revisions required.

## Key Flagged Items
- **1 broken link**: Automated rotation overview page was deleted on this branch. Needs replacement URL.
- **3 screenshot placeholders**: All in UI-related sections. Descriptive enough for capture.
- **2 UNKNOWN items**: Webhook notifications for rotation events; exact CASL permission names.
- **1 ASSUMED item**: UI editing flow inferred from docs, not directly observed.

## Output Files
- `docs/output/job-brief.md` — Job Brief
- `docs/output/research-brief.md` — Research Brief
- `docs/output/doc-plan.md` — Doc Plan (Structure Agent output)
- `docs/output/draft.md` — Working draft (with linking and editorial passes applied)
- `docs/output/titling-notes.md` — Titling Agent output with rationale
- `docs/output/rotate-secrets.mdx` — **Final assembled document**
- `docs/output/review-checklist.md` — This file (Human Review Checklist + Pipeline Summary)
