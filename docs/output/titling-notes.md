# Titling Output

## Frontmatter

```yaml
---
title: "Bitbucket"
description: "Learn how to authenticate Bitbucket Pipelines with Infisical using OpenID Connect (OIDC)."
---
```

## Titling Notes
- **Title rationale:** Matches the existing OIDC auth doc naming convention — each provider page is titled with just the provider name (e.g., "Github", "GitLab", "CircleCI", "Terraform Cloud"). The title sits under the "OIDC Auth" group in the navigation, so the context is already provided.
- **Slug rationale:** The file path `documentation/platform/identities/oidc-auth/bitbucket` follows the existing convention. No separate slug needed — Mintlify derives the slug from the file path.
- **SEO consideration:** The description includes "Bitbucket Pipelines", "Infisical", and "OIDC" for search visibility. Matches the description pattern from the GitHub OIDC doc.
- **Alternative titles considered:** "Configure OIDC Auth for Bitbucket Pipelines" — rejected because it breaks the naming convention used by all other OIDC auth provider pages. "Bitbucket Pipelines" — rejected because the existing convention uses just the platform name.
