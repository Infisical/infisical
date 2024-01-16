import { getConfig } from "@app/lib/config/env";
import jwt from "jsonwebtoken";
import {
  AuthModeProviderJwtTokenPayload,
  AuthModeProviderSignUpTokenPayload,
  AuthTokenType
} from "./auth-type";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

export const validateProviderAuthToken = (providerToken: string, email: string) => {
  if (!providerToken) throw new UnauthorizedError();
  const appCfg = getConfig();
  const decodedToken = jwt.verify(
    providerToken,
    appCfg.JWT_AUTH_SECRET
  ) as AuthModeProviderJwtTokenPayload;

  console.log(decodedToken);
  if (decodedToken.authTokenType !== AuthTokenType.PROVIDER_TOKEN) throw new UnauthorizedError();
  if (decodedToken.email !== email) throw new Error("Invalid auth credentials");
};

export const validateSignUpAuthorization = async (token: string, userId: string) => {
  const appCfg = getConfig();
  const [AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE] = <[string, string]>token?.split(" ", 2) ?? [
    null,
    null
  ];
  if (AUTH_TOKEN_TYPE === null) {
    throw new BadRequestError({ message: "Missing Authorization Header in the request header." });
  }
  if (AUTH_TOKEN_TYPE.toLowerCase() !== "bearer") {
    throw new BadRequestError({
      message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`
    });
  }
  if (AUTH_TOKEN_VALUE === null) {
    throw new BadRequestError({
      message: "Missing Authorization Body in the request header"
    });
  }

  const decodedToken = jwt.verify(
    AUTH_TOKEN_VALUE,
    appCfg.JWT_AUTH_SECRET
  ) as AuthModeProviderSignUpTokenPayload;

  if (decodedToken.authTokenType !== AuthTokenType.SIGNUP_TOKEN) throw new UnauthorizedError();
  if (decodedToken.userId !== userId) throw new UnauthorizedError();
};
