## Context

Previously, sub-organizations only had a single "name" field that had to be slug-friendly (alphanumeric + hyphens). Users could not set a human-readable display name (e.g. "Acme Corp") separate from the URL slug (e.g. "acme-corp").

This change introduces:
- **Display name** (`name`): Human-readable name with `GenericResourceNameSchema` (alphanumeric, spaces, dashes, underscores). Shown in the UI.
- **Slug** (`slug`): Optional; used in URLs and must be slug-friendly. If omitted on create, it is auto-generated from the display name via `slugify`. On update, name and slug can be edited independently; if only name is provided (no slug), both are updated for backward compatibility.

Related: ENG-4527

## Screenshots

<!-- Add screenshots of the new "Create sub-organization" form (Display Name + Slug) and the Sub-Organization settings (Display Name + Slug) if you have them. -->

## Steps to verify the change

1. **Create sub-org with display name only**  
   In the org switcher, create a new sub-organization. Enter a display name (e.g. "Acme Corp") and leave slug empty. Submit. Verify the sub-org is created with slug derived from the name (e.g. "acme-corp").

2. **Create sub-org with display name and custom slug**  
   Create another sub-org with display name "Beta Team" and slug "beta-team". Verify both are saved and the slug is used in URLs.

3. **Edit sub-org name/slug in settings**  
   Go to Organization Settings for a sub-org. Change display name and/or slug. Save. Verify changes persist and URL updates when slug changes.

4. **Backward compatibility**  
   Update a sub-org with only the display name field changed (no slug change). Verify the slug is regenerated from the new name.

## Type

- [ ] Fix
- [x] Feature
- [ ] Improvement
- [ ] Breaking
- [ ] Docs
- [ ] Chore

## Checklist

- [ ] Title follows the [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/#summary) format: `type(scope): short description` (scope is optional, e.g., `fix: prevent crash on sync` or `fix(api): handle null response`).
- [ ] Tested locally
- [ ] Updated docs (if needed)
- [ ] Read the [contributing guide](https://infisical.com/docs/contributing/getting-started/overview)
