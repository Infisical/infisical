import { LoginMethod, LoginPolicy } from "@app/domains/platform/instance-config-core/ce/module";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";

import {
  AuthMethod,
  AuthModeAccountRecoveryTokenPayload,
  AuthModeSignUpTokenPayload,
  AuthTokenType,
  MfaMethod,
  SsoMfaTrust
} from "./auth-type";

const oauthLoginMethods = {
  [AuthMethod.GITHUB]: {
    loginMethod: LoginMethod.GITHUB,
    disabledMessage: "Login with Github is disabled by administrator."
  },
  [AuthMethod.GOOGLE]: {
    loginMethod: LoginMethod.GOOGLE,
    disabledMessage: "Login with Google is disabled by administrator."
  },
  [AuthMethod.GITLAB]: {
    loginMethod: LoginMethod.GITLAB,
    disabledMessage: "Login with Gitlab is disabled by administrator."
  }
} as const;

export type OAuthAuthMethod = keyof typeof oauthLoginMethods;

type TLoginMethodPolicy = Pick<LoginPolicy, "allows">;

export const isOAuthLoginMethodDisabled = (authMethod: OAuthAuthMethod, loginPolicy: TLoginMethodPolicy) =>
  !loginPolicy.allows(oauthLoginMethods[authMethod].loginMethod);

export const assertOAuthLoginMethodEnabled = ({
  authMethod,
  loginPolicy,
  canBypass = false
}: {
  authMethod: OAuthAuthMethod;
  loginPolicy: TLoginMethodPolicy;
  canBypass?: boolean;
}) => {
  if (!isOAuthLoginMethodDisabled(authMethod, loginPolicy) || canBypass) return;

  throw new BadRequestError({
    message: oauthLoginMethods[authMethod].disabledMessage,
    name: "Oauth 2 login"
  });
};

export const MFA_METHOD_PRIORITY = [MfaMethod.WEBAUTHN, MfaMethod.TOTP, MfaMethod.EMAIL] as const;

type TMfaPolicyOrg = {
  enforceMfa?: boolean | null;
  allowedMfaMethods?: string[] | null;
};
type TMfaPolicyUser = { isMfaEnabled?: boolean | null; selectedMfaMethod?: string | null };

export const isMfaRequired = (org: TMfaPolicyOrg, user: TMfaPolicyUser) =>
  Boolean(org.enforceMfa) || Boolean(user.isMfaEnabled);

export const getOrgAllowedMfaMethods = (org: TMfaPolicyOrg): MfaMethod[] => {
  const allowed = MFA_METHOD_PRIORITY.filter((method) => org.allowedMfaMethods?.includes(method));
  return allowed.length ? allowed : [MfaMethod.EMAIL];
};

export const getUserAllowedMfaMethods = (org: TMfaPolicyOrg, user: TMfaPolicyUser): MfaMethod[] =>
  org.enforceMfa ? getOrgAllowedMfaMethods(org) : [(user.selectedMfaMethod as MfaMethod) ?? MfaMethod.EMAIL];

/*
 * Picks the method to challenge: the user's preferred one if it is allowed and set up, else the strongest
 * that is. usableMethods feeds "More options" at login; a null challengeMethod means the user must enroll
 * an allowed method first. Shared by login, step-up and PAM so all three challenge the same method.
 */
export const resolveMfaChallenge = ({
  allowedMethods,
  enrolledMethods,
  preferredMethod
}: {
  allowedMethods: MfaMethod[];
  enrolledMethods: MfaMethod[];
  preferredMethod?: string | null;
}): { usableMethods: MfaMethod[]; challengeMethod: MfaMethod | null } => {
  const usableMethods = MFA_METHOD_PRIORITY.filter(
    (method) => allowedMethods.includes(method) && enrolledMethods.includes(method)
  );
  const challengeMethod = usableMethods.find((method) => method === preferredMethod) ?? usableMethods[0] ?? null;
  return { usableMethods, challengeMethod };
};

export const isSsoAuthMethod = (authMethod: AuthMethod) =>
  isAuthMethodSaml(authMethod) || authMethod === AuthMethod.OIDC || authMethod === AuthMethod.LDAP;

/**
 * Whether a session counts as this root org's own SSO. The method alone is not enough: a SAML
 * session another org's IdP minted would otherwise satisfy this org's enforcement without its IdP,
 * MFA or deprovisioning ever seeing the login. Tokens issued before the claim existed carry no
 * issuer and are taken at their method, as before.
 */
export const isSsoSessionIssuedByOrg = ({
  authMethod,
  issuingRootOrgId,
  rootOrgId
}: {
  authMethod: AuthMethod;
  issuingRootOrgId?: string;
  rootOrgId: string;
}) => isSsoAuthMethod(authMethod) && (!issuingRootOrgId || issuingRootOrgId === rootOrgId);

// Whether the MFA the IdP performed satisfies this root org's enforcement. Shared by org selection and OAuth
// consent so a session that skipped the login prompt is not refused later. Only SAML and OIDC carry a signed
// IdP signal: password, Google and LDAP never qualify, so break-glass accounts always get the Infisical
// challenge. The proof names the org whose IdP produced it: a user in two orgs could otherwise tune one org's
// allowlist to accept a single factor and carry that verdict into the other.
export const isIdpMfaTrusted = ({
  org,
  authMethod,
  idpMfaOrgId
}: {
  org: { id: string; enforceMfa?: boolean | null; ssoMfaTrust?: string | null };
  authMethod: AuthMethod;
  idpMfaOrgId?: string;
}): boolean => {
  if (!org.enforceMfa) return false;
  if (!isAuthMethodSaml(authMethod) && authMethod !== AuthMethod.OIDC) return false;
  return org.ssoMfaTrust === SsoMfaTrust.Signal && idpMfaOrgId === org.id;
};

export const RECOVERY_CODE_MFA_ASSURANCE = "recovery-code";
export type TMfaAssurance = MfaMethod | typeof RECOVERY_CODE_MFA_ASSURANCE;

export const isMfaProofAccepted = (proven: string | null | undefined, acceptedMethods: MfaMethod[]): boolean =>
  proven === RECOVERY_CODE_MFA_ASSURANCE || acceptedMethods.includes(proven as MfaMethod);

export const extractBearerToken = (token?: string): string => {
  if (!token) {
    throw new UnauthorizedError({ message: "Missing Authorization Header in the request header." });
  }
  const [authTokenType, authTokenValue] = token.split(" ", 2) as [string, string];
  if (!authTokenType) {
    throw new UnauthorizedError({ message: "Missing Authorization Header in the request header." });
  }
  if (authTokenType.toLowerCase() !== "bearer") {
    throw new UnauthorizedError({
      message: `The provided authentication type '${authTokenType}' is not supported.`
    });
  }
  if (!authTokenValue) {
    throw new UnauthorizedError({
      message: "Missing Authorization Body in the request header"
    });
  }
  return authTokenValue;
};

export const validateSignUpAuthorization = (token: string, userId: string, validate = true) => {
  const appCfg = getConfig();
  const authTokenValue = extractBearerToken(token);

  const decodedToken = crypto.jwt().verify(authTokenValue, appCfg.AUTH_SECRET) as AuthModeSignUpTokenPayload;
  if (!validate) return decodedToken;

  if (decodedToken.authTokenType !== AuthTokenType.SIGNUP_TOKEN) throw new UnauthorizedError();
  if (decodedToken.userId !== userId) throw new UnauthorizedError();

  return decodedToken;
};

export const validatePasswordResetAuthorization = (token?: string) => {
  const appCfg = getConfig();
  const authTokenValue = extractBearerToken(token);

  const decodedToken = crypto.jwt().verify(authTokenValue, appCfg.AUTH_SECRET) as AuthModeAccountRecoveryTokenPayload;

  if (decodedToken.authTokenType !== AuthTokenType.ACCOUNT_RECOVERY_TOKEN) {
    throw new UnauthorizedError({
      message: `The provided authentication token type is not supported.`
    });
  }

  return decodedToken;
};

export const enforceUserLockStatus = (isLocked: boolean, temporaryLockDateEnd?: Date | null) => {
  if (isLocked) {
    throw new ForbiddenRequestError({
      name: "UserLocked",
      message:
        "User is locked due to multiple failed login attempts. An email has been sent to you in order to unlock your account. You can also reset your password to unlock your account."
    });
  }

  if (temporaryLockDateEnd) {
    const timeDiff = new Date().getTime() - temporaryLockDateEnd.getTime();
    if (timeDiff < 0) {
      const secondsDiff = (-1 * timeDiff) / 1000;
      const timeDisplay =
        secondsDiff > 60 ? `${Math.ceil(secondsDiff / 60)} minutes` : `${Math.ceil(secondsDiff)} seconds`;

      throw new ForbiddenRequestError({
        name: "UserLocked",
        message: `User is temporary locked due to multiple failed login attempts. Try again after ${timeDisplay}. You can also reset your password now to proceed.`
      });
    }
  }
};

/*
 * The org that invited a user who has not accepted yet: the org the signup token was issued for,
 * and only when it is still one of the user's own pending invitations, since the token outlives the
 * invitation it was minted for. Nothing else identifies the invite a signup came from, and a user
 * can be invited by several orgs before accepting, so anything inferred from the memberships alone
 * would group the signup under an org that did not recruit them. Attribute nothing instead.
 */
export const resolveInvitingOrgId = (pendingInviteMemberships: { scopeOrgId: string }[], invitedOrgId?: string) =>
  invitedOrgId && pendingInviteMemberships.some((membership) => membership.scopeOrgId === invitedOrgId)
    ? invitedOrgId
    : undefined;
