# Session Management Quick Reference

## What does the backend use for server sessions?

**Answer**: Redis-backed sessions using `@fastify/session` + `connect-redis`

## OIDC Organization Slug State Transfer

### How it works:

1. **Login Request** (`/api/v1/sso/oidc/login?orgSlug=acme`)
   ```typescript
   await req.session.regenerate();
   req.session.set("oidcOrgSlug", orgSlug);
   ```

2. **IDP Redirect** 
   - User authenticates at Identity Provider
   - Session persists in Redis with key: `oidc-session:{sessionId}`

3. **Callback** (`/api/v1/sso/oidc/callback`)
   ```typescript
   const oidcOrgSlug = req.session.get("oidcOrgSlug");
   const oidcStrategy = await getOrgAuthStrategy(oidcOrgSlug);
   ```

4. **Cleanup**
   ```typescript
   await req.session.destroy();
   return res.redirect(`/login/sso?token=${providerAuthToken}`);
   ```

## Key Details

| Aspect | Value |
|--------|-------|
| **Session Library** | `@fastify/session` |
| **Storage** | Redis via `connect-redis` |
| **OIDC Prefix** | `oidc-session:` |
| **OAuth Prefix** | `oauth-session:` |
| **TTL** | 10 minutes (600 seconds) |
| **Cookie SameSite** | `lax` |
| **Cookie Secure** | `true` (when HTTPS enabled) |
| **Signing Key** | `COOKIE_SECRET_SIGN_KEY` env var |

## Session Variables

### OIDC
- `oidcOrgSlug`: Organization slug
- `callbackPort`: CLI callback port (optional)

### OAuth
- `orgSlug`: Organization slug  
- `callbackPort`: CLI callback port (optional)
- `isAdminLogin`: Admin login flag (optional)

## Code Locations

- **OIDC Router**: `/backend/src/ee/routes/v1/oidc-router.ts`
- **OAuth Router**: `/backend/src/server/routes/v1/sso-router.ts`
- **Session Setup**: Lines 47-63 (OIDC), 270-283 (OAuth)

## Security Features

✅ Session regeneration on each login attempt  
✅ 10-minute TTL limits exposure  
✅ Cookie signing prevents tampering  
✅ HTTPS-only cookies in production  
✅ SameSite=lax prevents CSRF  
✅ Sessions destroyed after auth completion  

## For More Details

See [SESSION_MANAGEMENT.md](./SESSION_MANAGEMENT.md) for comprehensive documentation.
