import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";

import { AuthModeSignUpTokenPayload, AuthTokenType } from "./auth-type";

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

  const decodedToken = crypto.jwt().verify(authTokenValue, appCfg.AUTH_SECRET) as AuthModeSignUpTokenPayload;

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

export const verifyCaptcha = async (consecutiveFailedPasswordAttempts?: number | null, captchaToken?: string) => {
  const appCfg = getConfig();
  if (consecutiveFailedPasswordAttempts && consecutiveFailedPasswordAttempts >= 10 && Boolean(appCfg.CAPTCHA_SECRET)) {
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
