import { Knex } from "knex";

import { AccessScope, TableName, TUserAliases, TUsers } from "@app/db/schemas";
import {
  EventType,
  TAuditLogServiceFactory,
  TSsoUserEmailSyncSkipReason
} from "@app/ee/services/audit-log/audit-log-types";
import { TEmailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
import { verifyEmailDomainOwnership } from "@app/ee/services/email-domain/email-domain-fns";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError, ForbiddenRequestError } from "@app/lib/errors";
import { unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { sanitizeEmail } from "@app/lib/validator/validate-email";

import { ActorType } from "../auth/auth-type";
import { TOrgDALFactory } from "../org/org-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "./user-alias-dal";
import { UserAliasType } from "./user-alias-types";

type TEnsureSsoAccountVerifiedDTO = {
  user: TUsers;
  userAlias: TUserAliases;
  assertedEmail: string;
  userDAL: Pick<TUserDALFactory, "transaction" | "updateById">;
  userAliasDAL: Pick<TUserAliasDALFactory, "updateById">;
};

type TIsStaleSsoAliasDTO = {
  user: Pick<TUsers, "username" | "email">;
  userAlias: Pick<TUserAliases, "isEmailVerified" | "emails">;
  assertedEmail: string;
};

/**
 * The legacy SSO flow persisted aliases before email verification completed, so an as-yet-unverified
 * alias may point at a different user's account. Such an alias is "stale" when the email asserted by
 * the IdP in this login does not match any of the aliased account's known emails — i.e. the IdP has
 * not proven control of the aliased account. Callers must not provision org membership, identity
 * metadata, or group memberships onto that account (nor issue a session for it) until ownership is
 * proven via the separate email-verification flow. A verified alias is already trusted, so it is
 * never considered stale.
 */
export const isStaleSsoAlias = ({ user, userAlias, assertedEmail }: TIsStaleSsoAliasDTO): boolean => {
  if (userAlias.isEmailVerified) return false;

  const normalizedAssertedEmail = assertedEmail?.toLowerCase().trim();
  const accountEmails = new Set(
    [user.username, user.email, ...(userAlias.emails ?? [])]
      .filter((email): email is string => Boolean(email))
      .map((email) => email.toLowerCase().trim())
  );

  return !normalizedAssertedEmail || !accountEmails.has(normalizedAssertedEmail);
};

/**
 * When an org enforces SSO, the verified domain + IdP are authoritative, so we skip the separate
 * email-verification step. This marks the user + alias as verified/accepted before a session is
 * issued, covering accounts provisioned before enforcement was enabled as well as freshly created
 * ones. No-op when everything is already verified. Returns the (possibly updated) records so the
 * caller can keep its in-memory copies in sync.
 *
 * Anti-stale-alias guard: the legacy SSO flow persisted aliases before email verification
 * completed, so an unverified alias may point at a different user's account. We therefore only
 * promote an as-yet-unverified alias when the email asserted by the IdP in this login matches the
 * aliased account's known emails. Otherwise we return the records unchanged so the caller falls
 * back to the email-verification flow (no session is issued). Once an alias is already verified it
 * is trusted, so the user record is still accepted without re-checking the email.
 */
export const ensureSsoAccountVerified = async ({
  user,
  userAlias,
  assertedEmail,
  userDAL,
  userAliasDAL
}: TEnsureSsoAccountVerifiedDTO): Promise<{ user: TUsers; userAlias: TUserAliases }> => {
  if (userAlias.isEmailVerified && user.isAccepted && user.isEmailVerified) {
    return { user, userAlias };
  }

  // A still-unverified alias whose asserted email doesn't match the aliased account is stale and
  // must not be promoted — the caller falls back to the email-verification flow (no session issued).
  if (isStaleSsoAlias({ user, userAlias, assertedEmail })) {
    return { user, userAlias };
  }

  await userDAL.transaction(async (tx) => {
    if (!userAlias.isEmailVerified) {
      await userAliasDAL.updateById(userAlias.id, { isEmailVerified: true }, tx);
    }
    if (!user.isAccepted || !user.isEmailVerified) {
      await userDAL.updateById(user.id, { isAccepted: true, isEmailVerified: true }, tx);
    }
  });

  return {
    user: { ...user, isAccepted: true, isEmailVerified: true },
    userAlias: { ...userAlias, isEmailVerified: true }
  };
};

type TSyncSsoUserProfileDTO = {
  user: TUsers;
  userAlias: TUserAliases;
  // Caller has already sanitized this and verified its domain against the org.
  assertedEmail: string;
  assertedFirstName?: string | null;
  assertedLastName?: string | null;
  orgId: string;
  isAuthEnforced: boolean;
  userDAL: Pick<TUserDALFactory, "findOne" | "updateById" | "transaction">;
  userAliasDAL: Pick<TUserAliasDALFactory, "updateById">;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

/**
 * An IdP that keys people on a stable identifier (a UPN, say) lets them change mailbox and display
 * name without changing who they are, so our copy of both goes stale: notification mail is sent to
 * an address that no longer exists, and every audit entry written from then on records it. Where
 * the org enforces SSO it has already made the IdP authoritative for identity, so the assertion is
 * the better source and we take it.
 *
 * Requires a verified alias, which is our proof that the IdP controls this account. An unverified
 * alias asserting an unrecognized email is what isStaleSsoAlias exists to catch, and reading that
 * as a rename would let a stale alias rewrite somebody else's account.
 *
 * Runs on every login, so it writes only on a real difference. Call it outside the caller's
 * transaction: it owns its own, and the audit entry must not describe a change that later rolls
 * back.
 *
 * Never fails the login. An unsynced profile is stale data, which is what we already had, whereas a
 * throw here locks someone out of an org that has no other way in.
 */
export const syncSsoUserProfile = async ({
  user,
  userAlias,
  assertedEmail,
  assertedFirstName,
  assertedLastName,
  orgId,
  isAuthEnforced,
  userDAL,
  userAliasDAL,
  emailDomainDAL,
  auditLogService
}: TSyncSsoUserProfileDTO): Promise<TUsers> => {
  if (!isAuthEnforced || !userAlias.isEmailVerified) return user;

  const assertedUsername = sanitizeEmail(assertedEmail);
  const isEmailChanged = Boolean(assertedUsername) && assertedUsername !== user.username;

  const firstName = assertedFirstName?.trim();
  const lastName = assertedLastName?.trim();
  const nameChanges: { firstName?: string; lastName?: string } = {};
  if (firstName && firstName !== user.firstName) nameChanges.firstName = firstName;
  if (lastName && lastName !== user.lastName) nameChanges.lastName = lastName;
  const isNameChanged = Object.keys(nameChanges).length > 0;

  if (!isEmailChanged && !isNameChanged) return user;

  const logSkippedEmailSync = async ({
    reason,
    conflictingUserId
  }: {
    reason: TSsoUserEmailSyncSkipReason;
    conflictingUserId?: string;
  }) => {
    const detail =
      reason === "domain-not-owned"
        ? "the organization does not own both addresses"
        : "the asserted address belongs to another account";
    logger.warn(
      { userId: user.id, orgId, externalId: userAlias.externalId, assertedEmail: assertedUsername, conflictingUserId },
      `Skipped SSO email sync, ${detail} [userId=${user.id}] [orgId=${orgId}]`
    );
    await auditLogService
      .createAuditLog({
        actor: { type: ActorType.PLATFORM, metadata: {} },
        orgId,
        event: {
          type: EventType.SSO_USER_EMAIL_SYNC_SKIPPED,
          metadata: {
            userId: user.id,
            aliasType: userAlias.aliasType,
            externalId: userAlias.externalId,
            currentEmail: user.username,
            assertedEmail: assertedUsername,
            reason,
            conflictingUserId
          }
        }
      })
      .catch((err) => {
        logger.error(err, `Failed to audit the skipped SSO email sync for user ${user.id} in org ${orgId}`);
      });
  };

  let isEmailApplied = isEmailChanged;
  if (isEmailChanged) {
    const isOrgOwnedRename = await Promise.all([
      verifyEmailDomainOwnership({ email: user.username, orgId, emailDomainDAL }),
      verifyEmailDomainOwnership({ email: assertedUsername, orgId, emailDomainDAL })
    ])
      .then(() => true)
      .catch(() => false);

    if (!isOrgOwnedRename) {
      isEmailApplied = false;
      await logSkippedEmailSync({ reason: "domain-not-owned" });
      if (!isNameChanged) return user;
    }
  }

  if (isEmailApplied) {
    const conflictingUser = await userDAL.findOne({ username: assertedUsername });
    if (conflictingUser && conflictingUser.id !== user.id) {
      isEmailApplied = false;
      await logSkippedEmailSync({ reason: "address-taken", conflictingUserId: conflictingUser.id });
      if (!isNameChanged) return user;
    }
  }

  const writeProfile = (applyEmail: boolean) =>
    userDAL.transaction(async (tx) => {
      const nextUser = await userDAL.updateById(
        user.id,
        {
          ...nameChanges,
          ...(applyEmail ? { email: assertedUsername, username: assertedUsername } : {})
        },
        tx
      );

      if (applyEmail) {
        await userAliasDAL.updateById(
          userAlias.id,
          { emails: unique([...(userAlias.emails ?? []), assertedUsername]) },
          tx
        );
      }

      return nextUser;
    });

  let updatedUser: TUsers;
  try {
    updatedUser = await writeProfile(isEmailApplied);
  } catch (err) {
    if (
      !(err instanceof DatabaseError) ||
      (err.error as { code?: string })?.code !== DatabaseErrorCode.UniqueViolation
    ) {
      logger.error(err, `Failed to sync SSO profile for user ${user.id} in org ${orgId}`);
      return user;
    }

    await logSkippedEmailSync({ reason: "address-taken" });
    isEmailApplied = false;
    if (!isNameChanged) return user;

    try {
      updatedUser = await writeProfile(false);
    } catch (nameErr) {
      logger.error(nameErr, `Failed to sync SSO profile name for user ${user.id} in org ${orgId}`);
      return user;
    }
  }

  logger.info(
    { userId: user.id, orgId, externalId: userAlias.externalId, isEmailApplied },
    `Synced SSO profile from the identity provider [userId=${user.id}] [orgId=${orgId}]`
  );

  await auditLogService
    .createAuditLog({
      actor: { type: ActorType.PLATFORM, metadata: {} },
      orgId,
      event: {
        type: EventType.SSO_USER_PROFILE_SYNCED,
        metadata: {
          userId: user.id,
          aliasType: userAlias.aliasType,
          externalId: userAlias.externalId,
          ...(isEmailApplied ? { previousEmail: user.username, newEmail: assertedUsername } : {}),
          ...(nameChanges.firstName ? { previousFirstName: user.firstName, newFirstName: nameChanges.firstName } : {}),
          ...(nameChanges.lastName ? { previousLastName: user.lastName, newLastName: nameChanges.lastName } : {})
        }
      }
    })
    .catch((err) => {
      logger.error(err, `Failed to audit SSO profile sync for user ${user.id} in org ${orgId}`);
    });

  return updatedUser;
};

type TResolveAliasUserIdsDTO = {
  identifiers: string[];
  aliases: Pick<TUserAliases, "externalId" | "userId">[];
};

/**
 * Alias types scoped to one org. Social aliases carry a NULL orgId and are global, so letting them
 * resolve a provisioning identifier would let an org admin name a user in another tenant.
 */
export const ORG_SCOPED_USER_ALIAS_TYPES = [UserAliasType.OIDC, UserAliasType.SAML, UserAliasType.LDAP];

export const resolveAliasUserIds = ({ identifiers, aliases }: TResolveAliasUserIdsDTO) => {
  // externalId is case-sensitive, so don't fold it. Folding could collapse two different IdP
  // subjects onto one identifier.
  const userIdsByExternalId = new Map<string, Set<string>>();
  aliases.forEach((alias) => {
    const userIds = userIdsByExternalId.get(alias.externalId);
    if (userIds) {
      userIds.add(alias.userId);
    } else {
      userIdsByExternalId.set(alias.externalId, new Set([alias.userId]));
    }
  });

  const userIdByIdentifier = new Map<string, string>();
  const ambiguousIdentifiers: string[] = [];

  identifiers.forEach((identifier) => {
    const matchedUserIds = userIdsByExternalId.get(identifier);
    if (!matchedUserIds?.size) return;

    // Several aliases on the same user (an OIDC row plus a SAML row) is one account, not a
    // conflict. Two different users is a real conflict, and guessing wrong grants access to the
    // wrong person, so bail.
    if (matchedUserIds.size > 1) {
      ambiguousIdentifiers.push(identifier);
      return;
    }

    const [userId] = [...matchedUserIds];
    userIdByIdentifier.set(identifier, userId);
  });

  return { userIdByIdentifier, ambiguousIdentifiers };
};

type TResolveUsersBySsoExternalIdDTO = {
  identifiers: string[];
  orgId: string;
  // Sub-orgs usually have no IdP of their own, so a member's alias lives on the root org.
  rootOrgId?: string | null;
  userAliasDAL: Pick<TUserAliasDALFactory, "findBySsoExternalIds">;
  userDAL: Pick<TUserDALFactory, "find">;
  tx?: Knex;
};

/**
 * Maps an IdP identifier (a UPN, say) to the user its SSO alias points at. Only call this once an
 * exact username lookup has missed, so an alias can never shadow a real account.
 */
export const resolveUsersBySsoExternalId = async ({
  identifiers,
  orgId,
  rootOrgId,
  userAliasDAL,
  userDAL,
  tx
}: TResolveUsersBySsoExternalIdDTO): Promise<{ resolved: Map<string, TUsers>; ambiguousIdentifiers: string[] }> => {
  const empty = { resolved: new Map<string, TUsers>(), ambiguousIdentifiers: [] };

  const candidates = unique(identifiers.filter(Boolean));
  if (!candidates.length) return empty;

  const aliases = await userAliasDAL.findBySsoExternalIds(
    {
      externalIds: candidates,
      aliasTypes: ORG_SCOPED_USER_ALIAS_TYPES,
      orgIds: rootOrgId ? [orgId, rootOrgId] : [orgId]
    },
    tx
  );
  if (!aliases.length) return empty;

  const { userIdByIdentifier, ambiguousIdentifiers } = resolveAliasUserIds({ identifiers, aliases });
  const userIds = unique([...userIdByIdentifier.values()]);
  if (!userIds.length) return { resolved: new Map<string, TUsers>(), ambiguousIdentifiers };

  // Ghosts hold project key material, so they must never be reachable by a provisioning identifier.
  const users = await userDAL.find({ $in: { id: userIds }, isGhost: false }, { tx });
  const userById = new Map(users.map((user) => [user.id, user]));

  const resolved = new Map<string, TUsers>();
  userIdByIdentifier.forEach((userId, identifier) => {
    const user = userById.get(userId);
    if (user) resolved.set(identifier, user);
  });

  return { resolved, ambiguousIdentifiers };
};

type TAdoptProvisionedShadowUserDTO = {
  externalId: string;
  // Caller has already sanitized this and verified its domain against the org.
  assertedEmail: string;
  orgId: string;
  rootOrgId?: string | null;
  userDAL: Pick<TUserDALFactory, "findOne" | "updateById">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "find">;
  tx: Knex;
};

type TAdoptProvisionedShadowUserResult = {
  user: TUsers;
  adoptedFromUsername: string | null;
};

/**
 * Provisioning can name someone by their IdP identifier before they have ever logged in, which
 * leaves a placeholder account keyed on that identifier instead of their mailbox. On first login we
 * adopt the placeholder and rewrite it to the asserted mailbox, rather than creating a second
 * account and stranding whatever the placeholder was granted.
 *
 * Returns null if there is nothing safe to adopt. Only call this once a lookup on the asserted
 * email has missed. A non-null result carries `adoptedFromUsername`, which is null on the yield
 * path: the user is real either way, but only a non-null value means an account was rewritten.
 *
 * Throws when the placeholder is this org's own but its membership has been deactivated. A null
 * there would read as "no placeholder" and let the caller create a second account with a fresh
 * active membership, so the deactivation has to fail the login instead.
 */
export const adoptProvisionedShadowUser = async ({
  externalId,
  assertedEmail,
  orgId,
  rootOrgId,
  userDAL,
  userAliasDAL,
  orgDAL,
  tx
}: TAdoptProvisionedShadowUserDTO): Promise<TAdoptProvisionedShadowUserResult | null> => {
  // Only an identifier that is already canonical can name the placeholder, whose username came from
  // lowercasing the provisioner's input. A differently-cased identifier is a *different* subject
  // (OIDC Core defines `sub` as case-sensitive), so folding onto that match would hand it whatever
  // the other subject was granted, and would not work end to end anyway: the alias written here is
  // verbatim, and resolveUsersBySsoExternalId never folds when looking it up again.
  const shadowUsername = sanitizeEmail(externalId);
  if (!shadowUsername || shadowUsername !== externalId || shadowUsername === assertedEmail) return null;

  const candidate = await userDAL.findOne({ username: shadowUsername }, tx);
  if (!candidate) return null;

  // Ghosts hold project key material. The rest prove nobody ever claimed this account: accepted,
  // email-verified, or has a password all mean it belongs to someone.
  if (candidate.isGhost || candidate.isAccepted || candidate.isEmailVerified || candidate.hashedPassword) return null;

  // Keeps this to placeholders the org itself created through an authorized invite.
  const orgMemberships = await orgDAL.findMembership(
    {
      [`${TableName.Membership}.actorUserId` as "actorUserId"]: candidate.id,
      [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
    },
    { tx }
  );
  const orgMembership = orgMemberships.find((membership) => membership.scopeOrgId === orgId);
  if (!orgMembership) return null;

  // Resolved before every remaining decline, because declining is not neutral here: the caller
  // reads a null as "no placeholder" and creates a second account with a fresh active membership,
  // handing a deactivated person their org back. Adopting is no better, since it mutates a
  // deactivated account. Failing the login is the only safe answer, and it is what an already
  // aliased deactivated member gets.
  if (!orgMembership.isActive) {
    throw new ForbiddenRequestError({ message: "User organization membership is inactive" });
  }

  // Any alias, in any org, means some IdP already owns this account. Without this check one org's
  // IdP could steal an account bound to another's.
  const existingAlias = await userAliasDAL.findOne({ userId: candidate.id }, tx);
  if (existingAlias) return null;

  // That membership proves the placeholder belongs to this org, not that it belongs only to this
  // org. Username lookup is global, so a second tenant that invited the same identifier shares the
  // row, and adopting it would hand this org's IdP subject that tenant's memberships and project
  // access. Sub-orgs of one root are one tenant; anything reaching past that is left alone. A
  // project membership always implies an org membership in the same org, so this covers both.
  const familyRootOrgId = rootOrgId || orgId;
  const outsideOrgIds = unique(
    orgMemberships.map((membership) => membership.scopeOrgId).filter((scopeOrgId) => scopeOrgId !== orgId)
  );
  if (outsideOrgIds.length) {
    const outsideOrgs = await orgDAL.find({ $in: { id: outsideOrgIds } }, { tx });
    if (outsideOrgs.some((org) => (org.rootOrgId || org.id) !== familyRootOrgId)) return null;
  }

  // Postgres aborts the whole transaction on a constraint violation, so the update needs its own
  // savepoint: without one, the recovery lookup below and every write the caller still owes after
  // this call would fail with 25P02 instead.
  try {
    const adopted = await tx.transaction((savepoint) =>
      userDAL.updateById(candidate.id, { username: assertedEmail, email: assertedEmail }, savepoint)
    );
    return { user: adopted, adoptedFromUsername: shadowUsername };
  } catch (err) {
    // The caller's read showed nobody held the asserted email, but a read isn't a lock, so a
    // concurrent login or invite can grab it first (users.username is globally unique). Yield to
    // whoever won: same end state as the uncontended path, placeholder left alone.
    if (err instanceof DatabaseError && (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation) {
      const winner = await userDAL.findOne({ username: assertedEmail }, tx);
      if (winner) return { user: winner, adoptedFromUsername: null };
    }
    throw err;
  }
};
