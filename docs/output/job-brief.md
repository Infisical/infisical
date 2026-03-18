## Job Brief

**Topic:** Rotating secrets in Infisical — covering UI, CLI, and API workflows, versioning behavior, verification, application retrieval of updated secrets, best practices, and troubleshooting.

**Scope:**
- Include: Prerequisites for rotating secrets; how secret versioning works during rotation; rotating via UI; rotating via CLI; rotating via API; verifying the new version is active; how applications retrieve the updated secret; best practices; common mistakes and troubleshooting.
- Exclude: General cryptography theory; secret management theory; implementation internals unrelated to user workflow.

**Implied Diataxis Type:** How-To Guide

**Target Audience:** Platform engineers or administrators who need to rotate secrets safely without breaking applications.

**Known Resources:**
- Existing secrets management documentation in `docs/documentation/platform/`
- Machine identity documentation
- Environment documentation
- Secret versioning documentation (if present)
- CLI documentation in `docs/cli/`
- API reference in `docs/api-reference/`
- Backend source code for secret rotation and versioning logic

**Constraints:**
- Internal sources only — do not use outside knowledge for product behavior.
- Insert `[Screenshot: ...]` placeholders where UI steps are described.
- If rotation is available via multiple methods (UI, CLI, API), include separate sections for each.
- "Related resources" section at the end must be a simple markdown bullet list.
- Exact UI screenshots are not available; use descriptive placeholders.
