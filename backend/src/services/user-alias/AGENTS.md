# User aliases: provisioning identifiers and IdP profile sync

Read before changing `user-alias-fns.ts`, `user-alias-dal.ts`, SCIM user handlers, or any invite / removal
path that resolves people by identifier.

## Resolving users from provisioning identifiers

Invite and removal paths resolve a person by `users.username` (always equal to their email). An IdP may
only know them by another identifier (a UPN), which SSO login stores as `user_aliases.externalId`.
`resolveUsersBySsoExternalId` (backed by `userAliasDAL.findBySsoExternalIds`) is the one place that maps
it. It is wired into `$getUsers` (`membership-user-service.ts`), `project-membership-service.ts` and PAM's
`addProductUserMembers`.

- **Run it only after an exact `username` lookup missed**, so an alias never shadows a real account.
- **Scope by `orgId` and `ORG_SCOPED_USER_ALIAS_TYPES`.** Global google/github/gitlab aliases have a NULL
  `orgId`; without both filters an org admin could name a user in another tenant.
- **Match `externalId` exactly, never case-folded.** It is a case-sensitive IdP subject. Invite routes
  lowercase their input, so mixed-case identifiers cannot be provisioned today; fixing that means relaxing
  input validation, not the comparison.
- **Ambiguity is an error.** `(externalId, aliasType)` is not unique for org-scoped types, and guessing
  which human it names grants access to the wrong person. Several aliases on the same user are fine.
- **Dedupe resolved users by `id`**, or one request naming someone twice hits
  `membership_unique_user_org` as a 500.
- **SCIM reads match `userName` against every alias a user has, not the newest.** SSO login mints a new
  alias when the subject differs, and matching only the newest made users vanish from
  `GET /Users?filter=...`, so the IdP re-provisioned them. `$buildScimMembershipQuery` (`org-dal.ts`) uses a
  per-user `EXISTS` so negation (`ne`, `not`) stays correct, and the list query keeps a total order for
  `startIndex` paging.

### Adopting provisioned placeholders

`adoptProvisionedShadowUser` (wired into `oidcLogin`'s no-alias branch) rewrites a placeholder keyed on
the identifier to the asserted mailbox instead of creating a second account. It refuses anything a human
claimed (accepted, email-verified, has a password), anything already aliased, ghosts, identifiers that are
not already canonical lowercase, and placeholders without a membership in the login org.

- **An inactive membership in the login org throws** (`ForbiddenRequestError`) and is checked before every
  other decline. Returning `null` would make the caller create a fresh account with an active membership.
- **A membership outside the login org's sub-org family blocks adoption.** The username lookup is global,
  so adopting would hand this IdP subject another tenant's memberships.
- **Unique-violation recovery runs in a savepoint** (`tx.transaction()`), or Postgres aborts the caller's
  transaction (`25P02`).
- **Audit with `OIDC_PROVISIONED_PLACEHOLDER_ADOPTED`, never on the recovery path** (`adoptedFromUsername:
  null` marks it). Self-hosted instances without audit retention drop the event, so the `logger.info` line
  is the floor; do not special-case past the retention gate.
- SAML and LDAP are deliberately not wired up.

## Profile sync from the IdP (SSO-enforced orgs)

`syncSsoUserProfile` copies the asserted email and name onto the account. All three login services call it
after `ensureSsoAccountVerified`, outside the caller's transaction.

- **Gate: `isIdpAuthoritative` (`isIdpAuthoritativeForDomain`: the org enforces SSO and owns the asserted
  domain) and a verified alias.** An unverified alias with a new email is what
  `isStaleSsoAlias` catches; treating it as a rename would let a stale alias rewrite someone else's account.
- **It never fails a login.** A throw locks the person out of an org that has no other way in; stale data
  is what we already had. Every failure returns the unchanged user.
- **It only renames from an org-owned domain to an org-owned domain.** The user row is global. A skip is
  audited as `SSO_USER_EMAIL_SYNC_SKIPPED` (`reason: "domain-not-owned"`).
- **It never renames onto an occupied address**; it records `reason: "address-taken"` and still syncs the
  name. The preceding read is not a lock, so a unique violation lands on the same path.

SCIM follows the same gate: `updateScimUser` / `replaceScimUser` accept email changes via
`$resolveScimEmailChange` and answer an occupied address with `409 uniqueness`. Self-service email change
(`user-service.ts`) is refused when `$getManagedEmailReason` says the next login would overwrite it.
