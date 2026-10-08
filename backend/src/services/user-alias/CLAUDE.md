# Resolving Users From Provisioning Identifiers

Every invite / removal path resolves a person by `users.username` (which always equals their email),
never by `users.email` and never by a join. An external provisioning system, though, often knows
people only by the identifier its IdP asserts, a UPN like `m249913@one.example.com` rather than the
mailbox `robert@example.com`. SSO login already records that identifier as
`user_aliases.externalId`, so the two are reconcilable without making `username` diverge from
`email`.

`resolveUsersBySsoExternalId` in `src/services/user-alias/user-alias-fns.ts` is the one place that
does it, backed by `userAliasDAL.findBySsoExternalIds`. Callers run it **only after an exact
`username` lookup has missed**, so an alias can never shadow a real account. It is wired into
`$getUsers` (`membership-user-service.ts`, the single funnel for org, project, and cert-manager
invites), `project-membership-service.ts` (removal and membership read-back), and PAM's
`addProductUserMembers`.

Four invariants, each load-bearing:

- **Scope by `orgId` *and* `aliasType`.** `user_aliases.orgId` is NULL for the global
  google/github/gitlab aliases, so `whereIn("orgId", ...)` excludes them outright and the
  `ORG_SCOPED_USER_ALIAS_TYPES` filter is the second lock. Without both, an org admin could name a
  user in another tenant.
- **Match `externalId` exactly, never folded.** It is a case-sensitive identifier (OIDC Core defines
  `sub` that way, as does SAML for nameID) and is stored verbatim, so folding case could collapse two
  distinct IdP subjects onto one identifier. The known consequence: because both invite routes
  lowercase their input (`sanitizeEmail`, and the `.refine` on `usernames`), an IdP that asserts
  mixed-case identifiers cannot be provisioned against at all. Supporting those means relaxing that
  input validation so the exact identifier survives to the query, not loosening the comparison.
  `adoptProvisionedShadowUser` does not fold either. It derives its lookup key with `sanitizeEmail`
  because it searches the `users.username` namespace, where lowercase is canonical, but it then
  **refuses any identifier that is not already canonical** rather than adopting on the folded match.
  It once did adopt, and that was a real hole: a subject differing only by case is a different
  subject, so it could take over the placeholder provisioned for another one and inherit its grants.
  Folding bought nothing anyway, since the alias written afterwards is verbatim and this exact-match
  lookup could never find it again, stranding the grant where provisioning cannot manage it.
- **Ambiguity is an error.** Nothing constrains `(externalId, aliasType)` to be unique for the
  org-scoped types (only the social ones have a partial unique index), so an identifier can reach two
  users. Picking one would be a guess about which human it names, and the cost of guessing wrong is
  granting access to the wrong person. Several aliases on the *same* user are not a conflict.
- **Dedupe resolved users by `id`.** An identifier now reaches a user by either their username or
  their alias, so one request can name the same person twice. Undeduped, that violates
  `membership_unique_user_org` and surfaces as a 500.

Nothing constrains a user to one alias per `(orgId, aliasType)`, and SSO login mints a new one
whenever the asserted subject differs from what SCIM last wrote, so **a SCIM read must match a
`userName` against every one of a user's aliases, not the newest**. Matching only the newest made a
provisioned user vanish from `GET /Users?filter=userName eq "..."` the first time they logged in
under a different subject, and the IdP answered that empty lookup by provisioning them again. It was
intermittent because `replaceScimUser` rewrites `externalId` on *all* of a user's aliases, so the
next PUT healed it until the next login. `$buildScimMembershipQuery` (`org-dal.ts`) therefore
answers every `userName` comparison with an `EXISTS` over the user's aliases, so the predicate is per
user rather than per alias row. That matters for negation: evaluated per row, `userName ne "x"` or
`not (userName eq "x")` would keep a user through their other alias, and a member with no alias at
all would fall out through a NULL comparison. The parser (`lib/knex/scim.ts`) lets an attribute
resolve to a handler instead of a column for exactly this. Display is separate: the query still
joins every alias and collapses the fan-out with `DISTINCT ON`, ranked so the alias row that
satisfies the filter wins and the newest is the fallback, which is how a lookup by an older alias
echoes that alias back. The list query also carries a total order, because an IdP walking
`startIndex`/`count` over an unordered result loses users the same way.

A related case sits on the login side: provisioning can name someone before they have ever logged
in, leaving a placeholder account keyed on the identifier instead of the mailbox.
`adoptProvisionedShadowUser` (same file, wired into `oidcLogin`'s no-alias branch) adopts that row
and rewrites it to the asserted mailbox rather than creating a second account. It refuses anything a
human has claimed (accepted, email-verified, holding a password), anything already bound to an IdP
(any alias, any org), ghosts, anything whose identifier is not already canonical (see above), and
anything without a membership in the org doing the login.

One case is a refusal to *log in* rather than a refusal to adopt: a placeholder whose membership in
the login org is **inactive**. Declining is not neutral there, because the caller reads a `null` as
"no placeholder" and creates a second account with a fresh active membership, handing a deactivated
person their org back (`selectOrganization` then accepts it). So the inactive check is resolved
before every remaining decline — the alias check and the cross-tenant check both sit after it — and
it throws the same `ForbiddenRequestError` an already-aliased deactivated member gets.

It also refuses a placeholder that holds an org membership **outside** the login org's own sub-org
family, and that one is the security-critical check rather than a tidiness one. The username lookup
that finds the placeholder is global, so a second tenant that invited the same identifier shares the
row; adopting it would hand the login org's IdP subject that tenant's memberships, and
`selectOrganization` accepts a membership in any status (promoting `Invited` to `Accepted` on
arrival), so nothing downstream stops the inherited access from being used. A project membership
always implies an org membership in the same org, so the org-scope check covers project access too.

Adoption also recovers from a unique violation on `users.username`, because the caller's preceding
read is not a lock. That recovery has to run inside a savepoint (`tx.transaction()`, which knex
compiles to `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` on the same connection): Postgres aborts the whole
transaction on a constraint violation, so an unscoped retry would fail with `25P02`, taking the
caller's remaining alias and membership writes with it. SAML and LDAP have structurally identical
branches and are deliberately not wired up.

Because adoption rewrites an existing account's `username` and `email`, it emits an
`OIDC_PROVISIONED_PLACEHOLDER_ADOPTED` audit event carrying the before and after, not just an
application log: if one of the refusal checks above ever regresses, the audit trail is what makes it
findable. That event must never fire on the unique-violation recovery path, where the returned user
is whoever won the race rather than a rewritten placeholder. `adoptProvisionedShadowUser` draws that
line by returning `adoptedFromUsername: null` for the yield, and the caller keys the audit log on
it.

That trail is best-effort, not guaranteed. `audit-log-queue.ts` drops every entry at push time when
`plan.auditLogsRetentionDays` is falsy, which is the default for a self-hosted instance with no
audit-log entitlement, so on those deployments only the `logger.info` line survives an adoption.
Do not special-case this event past the retention gate; treat the application log as the floor and
the audit event as the addition for licensed instances.

# Profile Sync From The IdP (SSO-enforced orgs)

An IdP keyed on a stable identifier lets someone change mailbox and display name without changing
who they are, so our copy of both goes stale: notification mail goes to an address that no longer
exists, and every audit entry written from then on records it. `syncSsoUserProfile`
(`src/services/user-alias/user-alias-fns.ts`) carries the asserted email and name onto the account,
and is called from all three login services right after `ensureSsoAccountVerified`, outside the
caller's transaction, with its result flowing into the session.

The gate is `organization.authEnforced` **and** a verified alias, and both halves matter. Enforcement
is the org saying the IdP is authoritative for identity, which is the same claim that already skips
email verification at signup. The verified alias is the proof that the IdP controls *this* account:
an unverified alias asserting an unrecognized email is exactly what `isStaleSsoAlias` exists to
catch, and reading that as a rename would let a stale alias rewrite somebody else's account. One
consequence to know: a legacy unverified alias whose email changed before its next login is stale,
so it gets the email-verification fallback (a code sent to the dead mailbox) rather than a sync.

Three invariants:

- **It never fails a login.** A rename that could not be applied leaves stale data, which is what we
  already had; a throw locks the person out of an org that has no other way in. Every failure path
  returns the unchanged user.
- **It only renames an address the org owns, onto another address the org owns.** Both halves are
  checked in the helper against the org's verified domains. The user row is global rather than
  org-scoped, so without the first half an org could rename an account that merely carries one of
  its aliases and rewrite the identity every other org of that user sees. Every login path
  establishes both already (`verifyEmailDomainOwnership` is a positive check: the domain must be
  verified *for this org*, and the alias branch runs it against the existing account's username),
  so the helper's copy is there to keep the rename from outliving those checks. It is unreachable
  today, and audits the skip anyway (`SSO_USER_EMAIL_SYNC_SKIPPED` with
  `reason: "domain-not-owned"`) so a refactor that removes a caller's check leaves a trail rather
  than a silently stale account.
- **It never renames onto an occupied address.** `users.username` is globally unique and the row is
  global rather than org-scoped, so the asserted address may already be a personal signup or an
  unmerged duplicate. The conflict is recorded (`SSO_USER_EMAIL_SYNC_SKIPPED` with
  `reason: "address-taken"`) and the email is left alone; the name still syncs. The preceding read
  is not a lock, so a unique violation lands on the same path.

SCIM is the other half of the same story and moves with it. `updateScimUser` / `replaceScimUser`
rejected every email change outright, which left the data stale *and* put the provisioning job in a
permanent error state (Entra quarantines after repeated failures). Both now accept the change under
the same `authEnforced` gate via `$resolveScimEmailChange`, and answer an occupied address with
`409 uniqueness` rather than a constraint-shaped 500. Self-service email change
(`user-service.ts`) is refused when the next login would overwrite it anyway, which
`$getManagedEmailReason` narrows to the case that actually would: the account's own address sits on a
domain one of its SSO-enforced orgs has verified. Membership in an enforced org is not the test, since
the user row is global and an address outside that org's domains is one `syncSsoUserProfile` will not
touch. SCIM stays a blanket refusal, because the directory provisions the address either way.
