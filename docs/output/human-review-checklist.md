# Human Review Checklist

## Screenshot Placeholders
The draft reuses existing screenshots from the shared OIDC auth documentation set. These images already exist in the repository at `/images/platform/identities/`:
- `identities-org.png` — Organization identities page
- `identities-org-create.png` — Create identity modal
- `identities-page.png` — Identity management page
- `identities-page-remove-default-auth.png` — Removing default Universal Auth
- `identities-org-create-oidc-auth-method.png` — OIDC Auth configuration form
- `identities-project.png` — Project machine identities page
- `identities-project-create.png` — Adding identity to project

**Action needed:** No new screenshots are required. The existing shared screenshots are used, consistent with other OIDC auth docs.

## Diagram Placeholders
None — a Mermaid sequence diagram is included inline.

## VERIFY / ASSUMED Flags
- **[ASSUMED]** The Bitbucket OIDC issuer URL matches the discovery URL (`https://api.bitbucket.org/2.0/workspaces/<WORKSPACE>/pipelines-config/identity/oidc`). This is derived from the Atlassian AWS deployment guide pattern but is not explicitly stated as the `iss` claim value. **Action:** Verify by running a Bitbucket pipeline with `oidc: true` and inspecting the `$BITBUCKET_STEP_OIDC_TOKEN` JWT payload.
- **[ASSUMED]** Bitbucket Pipelines OIDC is available on all Bitbucket Cloud plans that support Pipelines. Atlassian docs do not specify plan-level restrictions. **Action:** Confirm with Atlassian documentation or test on a free-tier workspace.

## UNKNOWN Flags
- **[UNKNOWN]** The complete list of JWT claims in the Bitbucket OIDC token. The documented claims (`repositoryUuid`, `workspaceUuid`, `pipelineUuid`, `stepUuid`, `deploymentEnvironment`, `branchName`) are confirmed, but additional claims may exist. **Action:** Decode a live Bitbucket OIDC token to confirm the full claim set.
- **[UNKNOWN]** Whether Bitbucket Server/Data Center (self-hosted) supports OIDC for pipelines. This guide covers Bitbucket Cloud only. **Action:** If Bitbucket Server support is needed, research separately.
- **[UNKNOWN]** The exact format of `{WORKSPACE}` in the issuer URL — whether it is the workspace slug or UUID. The guide instructs users to copy the URL from Bitbucket settings directly. **Action:** Verify by checking the Bitbucket OpenID Connect settings page.

## LINK NEEDED Flags
None — all links validated against the docs directory.

## REVIEW Flags
None — editorial review passed without revision.

## Additional Actions
- **Navigation config:** Add a `bitbucket` entry to the OIDC Auth group in `docs/docs.json` (around line 286-294) to include this page in the docs navigation.
- **Cross-reference:** Consider adding a link from the existing Bitbucket CI/CD doc (`docs/integrations/cicd/bitbucket.mdx`) to this new OIDC auth guide as an alternative authentication method.

---

# Pipeline Summary

## Agents Invoked
1. **Research Agent** — Gathered technical details from the Infisical codebase (OIDC auth service, routes, schemas, validators) and external Bitbucket OIDC documentation.
2. **Structure Agent** — Produced a single how-to guide plan following the established OIDC auth doc pattern.
3. **Writing Agent** — Produced the full draft following the Doc Plan and Research Brief.
4. **Linking Agent** — Validated all 6 internal links (all valid). No broken links found.
5. **Editorial Agent** — Approved the draft. Minor style notes consistent with existing published docs.
6. **Titling Agent** — Generated frontmatter matching the existing OIDC auth doc naming convention.

## Revision Loops
None. The draft was approved on the first editorial pass.

## Key Flagged Items
- 2 ASSUMED flags (issuer URL format, plan availability) — recommend verifying with a live Bitbucket OIDC token
- 3 UNKNOWN flags (complete JWT claims, Bitbucket Server support, workspace placeholder format) — recommend decoding a live token to resolve
- Navigation config update needed in `docs/docs.json`
