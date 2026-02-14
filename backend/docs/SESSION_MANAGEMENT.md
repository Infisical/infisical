# Backend Session Management Architecture

## Overview

The Infisical backend uses **Redis-backed sessions** via `@fastify/session` and `connect-redis` to manage stateful authentication flows for OIDC and OAuth providers. This document explains the session architecture and how organization slug state is transferred during authentication.

## Technology Stack

### Session Storage
- **Library**: `@fastify/session` (Fastify session plugin)
- **Storage Backend**: Redis via `connect-redis`
- **Session Prefixes**:
  - `oidc-session:` for OIDC flows
  - `oauth-session:` for OAuth flows (Google, GitHub, GitLab)
- **TTL**: 10 minutes (600 seconds) for both OIDC and OAuth sessions

### Cookie Configuration
```typescript
{
  secret: COOKIE_SECRET_SIGN_KEY,
  store: redisStore,
  cookie: {
    secure: HTTPS_ENABLED,        // HTTPS-only when enabled
    sameSite: "lax"               // Allows cookies in redirects from IDP
  }
}
```

The `sameSite: "lax"` setting is crucial because it allows cookies to be sent to Infisical in redirects originating from the Identity Provider (IDP) server.

## OIDC Authentication Flow

### 1. Initial Login Request (`/api/v1/sso/oidc/login`)

**Query Parameters:**
- `orgSlug` (required): Organization slug identifier
- `callbackPort` (optional): CLI callback port for local development

**Session State Management:**
```typescript
// Ensure fresh session state per login attempt
await req.session.regenerate();

// Store organization slug in session
req.session.set("oidcOrgSlug", orgSlug);

// Store callback port if provided (for CLI auth)
if (callbackPort) {
  req.session.set("callbackPort", callbackPort);
}
```

**Implementation Reference:**
- File: `/backend/src/ee/routes/v1/oidc-router.ts` (lines 83-89)
- The session is regenerated to ensure fresh state for each login attempt
- Organization slug is stored in Redis with the session ID as the key

### 2. IDP Authentication

After storing the state, the user is redirected to the OIDC Identity Provider (IDP) for authentication using Passport.js:

```typescript
const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(orgSlug, callbackPort);
passport.authenticate(oidcStrategy, {
  scope: "profile email openid"
})
```

The strategy is created dynamically based on the organization's OIDC configuration, including:
- Discovery URL or manual endpoint configuration
- PKCE support (if available from IDP)
- ID token signature algorithm (RS256 by default)
- Client ID and secret

### 3. Callback Processing (`/api/v1/sso/oidc/callback`)

**Session State Retrieval:**
```typescript
// Retrieve organization slug from session
const oidcOrgSlug = req.session.get("oidcOrgSlug");
const callbackPort = req.session.get("callbackPort");

// Use slug to fetch OIDC configuration
const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(oidcOrgSlug, callbackPort);
```

**Implementation Reference:**
- File: `/backend/src/ee/routes/v1/oidc-router.ts` (lines 108-110)
- The organization slug is retrieved from the Redis-backed session
- Used to fetch organization-specific OIDC configuration from database

### 4. User Login Processing

After successful authentication with the IDP:

```typescript
// Extract claims from ID token
const claims = {
  email: idToken.email,
  sub: idToken.sub,
  groups: idToken.groups  // Optional group memberships
};

// Validate allowed email domains if configured
if (allowedEmailDomains) {
  // Check if user's email domain is allowed
}

// Process login and create provider auth token
const { providerAuthToken } = await oidcLogin({
  claims,
  orgSlug,
  // ... other params
});
```

The provider auth token is a JWT containing:
- `authTokenType`: PROVIDER_TOKEN
- `userId`: Authenticated user ID
- `organizationId`: Organization ID (resolved from slug)
- `organizationSlug`: Original org slug
- `email`: User's email from OIDC claims
- `callbackPort`: Optional CLI callback port

### 5. Session Cleanup

```typescript
// Destroy session after callback
await req.session.destroy();

// Redirect with provider auth token
if (req.passportUser.isUserCompleted) {
  return res.redirect(
    `${SITE_URL}/login/sso?token=${encodeURIComponent(providerAuthToken)}`
  );
}
```

**Implementation Reference:**
- File: `/backend/src/ee/routes/v1/oidc-router.ts` (lines 122-134)
- Session is destroyed after successful authentication
- State is no longer needed as it's now encoded in the provider auth token

## OAuth Authentication Flow

OAuth flows (Google, GitHub, GitLab) follow a similar pattern but with different session variables.

### Session State Variables

**OIDC Specific:**
- `oidcOrgSlug`: Organization slug for OIDC authentication
- `callbackPort`: CLI callback port

**OAuth Specific:**
- `orgSlug`: Organization slug for OAuth authentication
- `callbackPort`: CLI callback port  
- `isAdminLogin`: Flag for admin login flows

### OAuth Example (Google)

**Initial Request** (`/api/v1/sso/redirect/google`):
```typescript
await req.session.regenerate();

if (callbackPort) {
  req.session.set("callbackPort", callbackPort);
}
if (orgSlug) {
  req.session.set("orgSlug", orgSlug);
}
if (isAdminLogin) {
  req.session.set("isAdminLogin", isAdminLogin);
}
```

**Callback** (`/api/v1/sso/google`):
```typescript
const callbackPort = req.session.get("callbackPort");
const orgSlug = req.session.get("orgSlug");
const isAdminLogin = req.session.get("isAdminLogin");

// Process OAuth login
const { providerAuthToken } = await oauth2Login({
  email,
  firstName,
  lastName,
  authMethod: AuthMethod.GOOGLE,
  callbackPort,
  orgSlug
});

await req.session.destroy();
```

## Organization Resolution

The organization slug is resolved to an organization ID through the data access layer:

```typescript
// In oidc-config-service.ts
const org = await orgDAL.findOne({ slug: orgSlug });
if (!org) {
  throw new BadRequestError({ message: "Organization not found" });
}

const orgId = org.id;
```

This allows the system to:
1. Fetch organization-specific OIDC configuration
2. Validate user against organization settings
3. Manage group memberships if enabled
4. Create proper authorization context

## Session Security

### Key Security Features

1. **Session Regeneration**: Fresh session for each login attempt prevents session fixation attacks
2. **Short TTL**: 10-minute expiration limits exposure window
3. **Cookie Signing**: Sessions are signed with `COOKIE_SECRET_SIGN_KEY`
4. **HTTPS Enforcement**: Secure cookies when `HTTPS_ENABLED=true`
5. **SameSite Protection**: `lax` setting balances security and functionality
6. **Ephemeral State**: Sessions destroyed after successful authentication

### Redis Storage Pattern

Sessions are stored in Redis with the following structure:

```
Key: {prefix}:{sessionId}
Prefix: "oidc-session:" or "oauth-session:"
TTL: 600 seconds (10 minutes)
Value: JSON serialized session data
```

Example Redis key:
```
oidc-session:abcd1234-5678-90ef-ghij-klmnopqrstuv
```

## Why Sessions Are Required

According to the OIDC specification and implementation notes:

> OIDC protocol cannot work without sessions: https://github.com/panva/node-openid-client/issues/190

Sessions are required because:
1. **State Management**: OAuth/OIDC requires state parameter to prevent CSRF attacks
2. **Callback Correlation**: Need to correlate callback with original request
3. **Stateful Redirects**: IDP redirects require maintaining application state
4. **PKCE Code Storage**: Code challenge/verifier must persist across redirect

## Implementation Notes

### Current Limitations

From the code comments:

> Current redis usage is not ideal and will eventually have to be refactored to use a better structure

The current implementation works but could be improved with:
- Better session data structure
- More granular TTL management
- Session clustering for high availability
- Migration to alternative state management (if OIDC spec allows)

### Passport.js Integration

The implementation uses `@fastify/passport` which has poor TypeScript support, requiring many type assertions and `any` types. This is noted in the code:

```typescript
// All the any rules are disabled because passport typesense with fastify is really poor
// Note: "typesense" appears to be a typo for "type support" in the original source
```

## SAML Authentication

SAML authentication uses a similar session pattern but without Redis storage:

```typescript
await server.register(fastifySession, { 
  secret: COOKIE_SECRET_SIGN_KEY 
});
```

SAML sessions use the default session store (memory-based) because:
1. SAML flows are typically faster (fewer redirects)
2. Organization information is embedded in SAML request/response
3. Less state needs to be maintained across redirects

## Configuration Files

### OIDC Router
- **File**: `/backend/src/ee/routes/v1/oidc-router.ts`
- **Lines**: 38-135 (session setup and routes)

### OAuth/SSO Router  
- **File**: `/backend/src/server/routes/v1/sso-router.ts`
- **Lines**: 267-285 (session setup)

### Keystore (Redis Client)
- **File**: `/backend/src/keystore/keystore.ts`
- **Purpose**: Central Redis client management and key prefixes

## Environment Variables

Required environment variables for session management:

- `COOKIE_SECRET_SIGN_KEY`: Secret key for signing session cookies
- `HTTPS_ENABLED`: Enable secure cookies (true/false)
- `SITE_URL`: Base URL for callback redirects
- `REDIS_URL` or `REDIS_*`: Redis connection configuration

## Best Practices

When working with sessions in this codebase:

1. **Always regenerate** sessions at the start of authentication flows
2. **Always destroy** sessions after successful authentication
3. **Use typed getters/setters** with session data (even if typed as `any`)
4. **Keep TTL short** to minimize security exposure
5. **Store minimal data** - only what's needed for the redirect flow
6. **Never store secrets** in sessions (only identifiers and metadata)

## Example Flow Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ GET /api/v1/sso/oidc/login?orgSlug=acme
       ▼
┌─────────────────────────────────────────────┐
│  Backend (OIDC Router)                      │
│  1. Regenerate session                      │
│  2. Store orgSlug in Redis session          │
│  3. Redirect to IDP with state              │
└──────┬──────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│     IDP     │ (User authenticates)
└──────┬──────┘
       │ Redirect back with code
       ▼
┌─────────────────────────────────────────────┐
│  Backend (OIDC Callback)                    │
│  1. Retrieve orgSlug from Redis session     │
│  2. Fetch org-specific OIDC config          │
│  3. Validate ID token with org settings     │
│  4. Create provider auth token (JWT)        │
│  5. Destroy session                         │
│  6. Redirect to frontend with token         │
└──────┬──────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   Client    │ (Login complete)
└─────────────┘
```

## Conclusion

The backend uses a robust, Redis-backed session management system to handle stateful OIDC and OAuth authentication flows. The organization slug is transferred through Redis sessions during the authentication process, ensuring that organization-specific configurations are applied correctly while maintaining security best practices.
