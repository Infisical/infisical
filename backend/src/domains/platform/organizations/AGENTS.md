# Organizations domain

The top-level container: orgs and sub-orgs. Owns `organizations`. Holds what every request acting in an org needs (`findActorOrg`: name, root and parent org, the privilege-system flag and the root org's sign-in policy), the root-org lookup, and the org rule schema (`service/permission/org-permission.ts`).

- **Below Projects:** Organizations never reads or calls Projects. A sub-org's policy comes from its root org's row.
- **SSO enforcement is a session check, not a permission check.** `assertSessionAllowed` runs once per request in `actorContexts.forRequest` and refuses with 401 a user session the root org's policy refuses (bypass only through `bypassOrgAuthEnabled` plus the user's root-org `BypassSsoEnforcement`). Never check SSO inside a permission function. A flow that checks a session against an org other than the request's (select-organization, OAuth consent, token exchange) uses the same rule, `ssoSessionRefusal`, so the two can never disagree.
