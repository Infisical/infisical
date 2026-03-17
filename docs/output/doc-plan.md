# Doc Plan

## Document Set Overview
This plan produces a single how-to guide for configuring OIDC authentication between Bitbucket Pipelines and Infisical. The content is a single task-oriented workflow and does not need to be split into multiple documents. The structure follows the established pattern used by the existing OIDC auth guides (GitHub, GitLab, CircleCI, Terraform Cloud) for consistency.

---

## Document 1: Configure OIDC Auth for Bitbucket Pipelines

**Diataxis Type:** How-To
**File Path:** `/docs/documentation/platform/identities/oidc-auth/bitbucket.mdx`
**Audience:** Platform engineers or DevOps engineers authenticating Bitbucket pipelines to Infisical without long-lived credentials
**Purpose:** After reading, the user can configure a machine identity in Infisical with OIDC Auth for Bitbucket Pipelines, and retrieve secrets in a pipeline without static credentials.

### Outline

1. **Introduction (1 paragraph)**
   - One-sentence goal statement: what this guide accomplishes.
   - Brief description of OIDC Auth as a platform-agnostic JWT-based authentication method.

2. **Diagram**
   - Mermaid sequence diagram showing the OIDC Auth flow between Bitbucket Pipeline, Bitbucket Identity Provider, and Infisical (matching the pattern from existing OIDC docs).

3. **Concept**
   - High-level explanation of the authentication flow (5 numbered steps: request token, send to Infisical, fetch public key, validate JWT, return access token).
   - Note about network access requirement.

4. **Guide (Steps)**
   - **Step 1: Creating an identity**
     - Navigate to Organization Settings > Access Control > Identities.
     - Create identity with name and role.
     - [Screenshot: identities-org.png — Organization identities page]
     - [Screenshot: identities-org-create.png — Create identity modal]
     - Reconfigure from Universal Auth to OIDC Auth.
     - [Screenshot: identities-page-remove-default-auth.png — Removing default Universal Auth]
     - [Screenshot: identities-org-create-oidc-auth-method.png — OIDC Auth configuration form]
     - Warning admonition about restricting access via Subject, Audiences, Claims.
     - Field-by-field guidance table with Bitbucket-specific values:
       - OIDC Discovery URL
       - Issuer
       - CA Certificate
       - Subject (with Bitbucket format explanation)
       - Audiences (with Bitbucket default + custom options)
       - Claims (available Bitbucket claims)
       - Access Token TTL
       - Access Token Max TTL
       - Access Token Max Number of Uses
       - Access Token Trusted IPs
     - Info admonition about glob pattern support.
     - Tip about finding the Identity Provider URL in Bitbucket Repository Settings > OpenID Connect.

   - **Step 2: Adding an identity to a project**
     - Navigate to Project Settings > Access Control > Machine Identities.
     - Add identity and assign project role.
     - [Screenshot: identities-project.png — Project machine identities page]
     - [Screenshot: identities-project-create.png — Adding identity to project]

   - **Step 3: Configuring the Bitbucket pipeline**
     - Enable OIDC on the pipeline step with `oidc: true`.
     - Explain `$BITBUCKET_STEP_OIDC_TOKEN` environment variable.
     - Show full pipeline YAML example using Infisical CLI to login and inject secrets.
     - [Code Example: Complete bitbucket-pipelines.yml with OIDC auth and secret injection]
     - Note about access token TTL and re-authentication.

5. **Troubleshooting**
   - Common configuration mistakes and how to resolve them:
     - Incorrect OIDC Discovery URL / Issuer
     - Subject mismatch
     - Audience mismatch
     - Missing `oidc: true` in pipeline step
     - Network connectivity issues
     - Token expiration

6. **Related resources**
   - Simple markdown bullet list linking to related docs (OIDC Auth general, machine identities, CLI docs, other OIDC auth guides).

### Prerequisites
- An Infisical account (Cloud or self-hosted)
- A Bitbucket Cloud workspace with Pipelines enabled
- A Bitbucket repository with a `bitbucket-pipelines.yml` file
- Secrets stored in an Infisical project
- [ASSUMED] Bitbucket Pipelines OIDC available on all Bitbucket Cloud plans with Pipelines

### Linking
- Links to: OIDC Auth general doc, Machine Identities doc, CLI login docs, role-based access controls doc
- Linked from: OIDC Auth group in docs navigation, existing Bitbucket CI/CD doc (could add cross-reference)

---

## Linking Map

| Source Document | Links To | Link Context |
|-----------------|----------|--------------|
| Bitbucket OIDC Auth | OIDC Auth general | Introduction — link to general OIDC concept page |
| Bitbucket OIDC Auth | Machine Identities | Step 1 — link when mentioning machine identities concept |
| Bitbucket OIDC Auth | Role-Based Access Controls | Step 1 — link when mentioning roles |
| Bitbucket OIDC Auth | CLI login docs | Step 3 — link when mentioning CLI login command |
| Bitbucket OIDC Auth | Bitbucket OIDC external docs | Step 1 — link for subject/audience format reference |

## Flagged Items
- Carried forward: [ASSUMED] Bitbucket OIDC issuer URL matches discovery URL
- Carried forward: [ASSUMED] OIDC available on all Bitbucket Cloud plans with Pipelines
- Carried forward: [UNKNOWN] Complete list of Bitbucket OIDC JWT claims
- Carried forward: [UNKNOWN] Whether Bitbucket Server/Data Center supports OIDC
- Carried forward: [UNKNOWN] Exact format of {WORKSPACE} placeholder (slug vs UUID)
