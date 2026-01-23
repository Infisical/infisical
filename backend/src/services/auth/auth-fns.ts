import { TUsers } from "@app/db/schemas/users";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";

import {
  AuthMethod,
  AuthModeProviderJwtTokenPayload,
  AuthModeProviderSignUpTokenPayload,
  AuthTokenType
} from "./auth-type";

export const validateProviderAuthToken = (providerToken: string, username?: string) => {
  if (!providerToken) throw new UnauthorizedError();
  const appCfg = getConfig();
  const decodedToken = crypto.jwt().verify(providerToken, appCfg.AUTH_SECRET) as AuthModeProviderJwtTokenPayload;

  if (decodedToken.authTokenType !== AuthTokenType.PROVIDER_TOKEN) throw new UnauthorizedError();

  if (decodedToken.username !== username) throw new Error("Invalid auth credentials");

  if (decodedToken.organizationId) {
    return { orgId: decodedToken.organizationId, authMethod: decodedToken.authMethod, userName: decodedToken.username };
  }

  return { authMethod: decodedToken.authMethod, orgId: null, userName: decodedToken.username };
};

export const validateSignUpAuthorization = (token: string, userId: string, validate = true) => {
  const appCfg = getConfig();
  const [AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE] = <[string, string]>token?.split(" ", 2) ?? [null, null];
  if (AUTH_TOKEN_TYPE === null) {
    throw new UnauthorizedError({ message: "Missing Authorization Header in the request header." });
  }
  if (AUTH_TOKEN_TYPE.toLowerCase() !== "bearer") {
    throw new UnauthorizedError({
      message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`
    });
  }
  if (AUTH_TOKEN_VALUE === null) {
    throw new UnauthorizedError({
      message: "Missing Authorization Body in the request header"
    });
  }

  const decodedToken = crypto.jwt().verify(AUTH_TOKEN_VALUE, appCfg.AUTH_SECRET) as AuthModeProviderSignUpTokenPayload;
  if (!validate) return decodedToken;

  if (decodedToken.authTokenType !== AuthTokenType.SIGNUP_TOKEN) throw new UnauthorizedError();
  if (decodedToken.userId !== userId) throw new UnauthorizedError();
};

export const validatePasswordResetAuthorization = (token?: string) => {
  if (!token) throw new UnauthorizedError();

  const appCfg = getConfig();
  const [AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE] = <[string, string]>token?.split(" ", 2) ?? [null, null];
  if (AUTH_TOKEN_TYPE === null) {
    throw new UnauthorizedError({ message: "Missing Authorization Header in the request header." });
  }
  if (AUTH_TOKEN_TYPE.toLowerCase() !== "bearer") {
    throw new UnauthorizedError({
      message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`
    });
  }
  if (AUTH_TOKEN_VALUE === null) {
    throw new UnauthorizedError({
      message: "Missing Authorization Body in the request header"
    });
  }

  const decodedToken = crypto.jwt().verify(AUTH_TOKEN_VALUE, appCfg.AUTH_SECRET) as AuthModeProviderSignUpTokenPayload;

  if (decodedToken.authTokenType !== AuthTokenType.SIGNUP_TOKEN) {
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

export const verifyCaptcha = async (user: TUsers, captchaToken?: string) => {
  const appCfg = getConfig();
  if (
    user.consecutiveFailedPasswordAttempts &&
    user.consecutiveFailedPasswordAttempts >= 10 &&
    Boolean(appCfg.CAPTCHA_SECRET)
  ) {
    if (!captchaToken) {
      throw new BadRequestError({
        name: "Captcha Required",
        message: "Accomplish the required captcha by logging in via Web"
      });
    }

    // validate captcha token
    const response = await request.postForm<{ success: boolean }>("https://api.hcaptcha.com/siteverify", {
      response: captchaToken,
      secret: appCfg.CAPTCHA_SECRET
    });

    if (!response.data.success) {
      throw new BadRequestError({
        name: "Invalid Captcha"
      });
    }
  }
};

export const getAuthMethodAndOrgId = (email: string, providerAuthToken?: string) => {
  let authMethod = AuthMethod.EMAIL;
  let organizationId: string | undefined;

  if (providerAuthToken) {
    const decodedProviderToken = validateProviderAuthToken(providerAuthToken, email);

    authMethod = decodedProviderToken.authMethod;
    if (
      (isAuthMethodSaml(authMethod) || [AuthMethod.LDAP, AuthMethod.OIDC].includes(authMethod)) &&
      decodedProviderToken.orgId
    ) {
      organizationId = decodedProviderToken.orgId;
    }
  }

  return { authMethod, organizationId };
};
