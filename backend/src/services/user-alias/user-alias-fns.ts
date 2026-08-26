import { Knex } from "knex";

import { AccessScope, TableName, TUserAliases, TUsers } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError } from "@app/lib/errors";
import { unique } from "@app/lib/fn";
import { sanitizeEmail } from "@app/lib/validator/validate-email";

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

  // Any alias, in any org, means some IdP already owns this account. Without this check one org's
  // IdP could steal an account bound to another's.
  const existingAlias = await userAliasDAL.findOne({ userId: candidate.id }, tx);
  if (existingAlias) return null;

  // Keeps this to placeholders the org itself created through an authorized invite.
  const orgMemberships = await orgDAL.findMembership(
    {
      [`${TableName.Membership}.actorUserId` as "actorUserId"]: candidate.id,
      [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
    },
    { tx }
  );
  if (!orgMemberships.some((membership) => membership.scopeOrgId === orgId)) return null;

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
