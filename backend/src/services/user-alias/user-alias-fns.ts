import { TUserAliases, TUsers } from "@app/db/schemas";

import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "./user-alias-dal";

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
