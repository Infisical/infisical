# Job Brief

**Topic:** Configuring OIDC authentication between Bitbucket Pipelines and Infisical to securely access secrets during CI/CD runs.

**Scope:**
- Include: Prerequisites for using OIDC with Bitbucket Pipelines and Infisical; creating/configuring an identity provider in Infisical for Bitbucket; configuring the Bitbucket pipeline to request an OIDC identity token; mapping the Bitbucket identity token to an Infisical machine identity or access role; retrieving secrets from Infisical within a Bitbucket pipeline; verifying the integration works; common configuration mistakes and troubleshooting.
- Exclude: General OIDC/OAuth theory; deep CI/CD pipeline explanations; Universal Auth Bitbucket integration as primary reference.

**Implied Diataxis Type:** How-to guide

**Target Audience:** Platform engineers or DevOps engineers who need to authenticate Bitbucket pipelines to Infisical without using long-lived credentials.

**Known Resources:**
- Infisical codebase (backend auth architecture, OIDC identity auth implementation, machine identity services)
- Existing Infisical docs (authentication, machine identities, environment/secret access)
- External: https://support.atlassian.com/bitbucket-cloud/docs/oidc-for-pipelines/, https://developer.atlassian.com/, https://openid.net/

**Constraints:**
- Do NOT use the existing Bitbucket CI/CD doc (Universal Auth) as the reference implementation. Derive the workflow from the codebase and auth architecture.
- Insert screenshot placeholders where UI configuration steps occur.
- "Related resources" section must be a simple markdown bullet list.
- Known gap: exact UI screenshots are unavailable — use descriptive placeholders.
