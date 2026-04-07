# User Authentication Methods

Guide the user through configuring authentication for human users in their Infisical organization. This covers how people log in to the Infisical dashboard and CLI.

## Available user auth methods

| Method | Type | Best for |
|--------|------|----------|
| **Email Auth** | Built-in | Getting started, small teams |
| **Google OAuth** | Social login | Teams using Google Workspace |
| **GitHub OAuth** | Social login | Developer teams on GitHub |
| **GitLab OAuth** | Social login | Teams using GitLab |
| **SAML 2.0** | Enterprise SSO | Okta, Azure AD, JumpCloud, Google, Keycloak |
| **OIDC** | Enterprise SSO | Any OpenID Connect provider |
| **LDAP** | Directory auth | Active Directory, OpenLDAP |

## Email Auth (default)

This is enabled by default and requires no additional configuration. When a user signs up:

1. They create an account with email + password
2. They receive an **Emergency Kit** PDF — the only way to recover access if they forget their password
3. MFA (multi-factor authentication) is recommended and can be enabled in Personal Settings

**Password management**: Users can change their password in Personal Settings > Authentication tab.

**Email change**: Available in Personal Settings > Authentication. Sends a 6-digit verification code to the new email. Note: this disconnects all external auth methods and terminates all sessions for security. Disabled if SCIM provisioning is active.

## OAuth login (Google, GitHub, GitLab)

To enable social login, set these environment variables on the backend:

### Google
```
CLIENT_ID_GOOGLE_LOGIN=<your-google-oauth-client-id>
CLIENT_SECRET_GOOGLE_LOGIN=<your-google-oauth-client-secret>
```

### GitHub
```
CLIENT_ID_GITHUB_LOGIN=<your-github-oauth-app-client-id>
CLIENT_SECRET_GITHUB_LOGIN=<your-github-oauth-app-client-secret>
```

### GitLab
```
CLIENT_ID_GITLAB_LOGIN=<your-gitlab-application-id>
CLIENT_SECRET_GITLAB_LOGIN=<your-gitlab-application-secret>
```

Each requires creating an OAuth application in the respective provider and setting the callback URL to `<SITE_URL>/api/v1/sso/<provider>/callback`.

## SAML 2.0 (Enterprise SSO)

Infisical supports SAML with these identity providers:

- **Okta** (AuthMethod: `OKTA_SAML`)
- **Azure AD** (AuthMethod: `AZURE_SAML`)
- **JumpCloud** (AuthMethod: `JUMPCLOUD_SAML`)
- **Google Workspace** (AuthMethod: `GOOGLE_SAML`)
- **Keycloak** (AuthMethod: `KEYCLOAK_SAML`)

SAML is configured per-organization in the Infisical dashboard under Organization Settings > Authentication. The general flow:

1. Create a SAML application in your IdP (Okta, Azure AD, etc.)
2. Configure the SSO endpoint URL (ACS URL) from Infisical
3. Map user attributes (email, firstName, lastName)
4. Enter the IdP metadata (Entity ID, SSO URL, Certificate) in Infisical
5. Enable SAML for the organization

Point users to `docs/documentation/platform/auth-methods/` for provider-specific walkthroughs.

## OIDC (OpenID Connect)

Generic OIDC authentication works with any compliant provider. Configuration includes:

- Discovery URL or manual endpoint configuration
- Client ID and Client Secret
- Allowed scopes and claim mappings

Configured at the organization level, similar to SAML.

## LDAP

For organizations using Active Directory or OpenLDAP:

- Configure LDAP server URL, bind DN, search base
- Map LDAP attributes to Infisical user fields
- Supports both direct bind and search-then-bind modes
- TLS/STARTTLS supported with custom CA certificates

For local testing, the dev compose file (`docker-compose.dev.yml`) includes optional OpenLDAP and phpLdapAdmin containers.

## Auth enforcement

Organization admins can enforce specific auth methods, preventing users from logging in with other methods. This is useful for ensuring everyone goes through SSO.

## Deprecated methods (do NOT use)

- **API_KEY**: The `X-API-Key` header auth mode is deprecated. The backend will throw an error if used.
- **SERVICE_TOKEN**: Tokens prefixed with `st.` are legacy. Use machine identities instead (see `machine-identities.md`).

## Relevant code paths

- `backend/src/server/plugins/auth/` — auth extraction and injection
- `backend/src/services/auth/auth-type.ts` — AuthMethod and AuthMode enums
- `docs/documentation/platform/auth-methods/` — user-facing auth docs per provider
