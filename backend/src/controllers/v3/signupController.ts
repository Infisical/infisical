import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { MembershipOrg, User } from "../../models";
import { completeAccount } from "../../helpers/user";
import { initializeDefaultOrg } from "../../helpers/signup";
import { issueAuthTokens, validateProviderAuthToken } from "../../helpers/auth";
import { ACCEPTED, AuthTokenType, INVITED } from "../../variables";
import { standardRequest } from "../../config/request";
import { getAuthSecret, getHttpsEnabled, getLoopsApiKey } from "../../config";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import { TelemetryService } from "../../services";
import { AuthMethod } from "../../models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/auth";

/**
 * Complete setting up user by adding their personal and auth information as part of the
 * signup flow
 * @param req
 * @param res
 * @returns
 */
export const completeAccountSignup = async (req: Request, res: Response) => {
  let user, token;
  try {
    const {
      body: {
        email,
        publicKey,
        salt,
        lastName,
        verifier,
        firstName,
        protectedKey,
        protectedKeyIV,
        protectedKeyTag,
        organizationName,
        providerAuthToken,
        attributionSource,
        encryptedPrivateKey,
        encryptedPrivateKeyIV,
        encryptedPrivateKeyTag
      }
    } = await validateRequest(reqValidator.CompletedAccountSignupV3, req);

    user = await User.findOne({ email });

    if (!user || (user && user?.publicKey)) {
      // case 1: user doesn't exist.
      // case 2: user has already completed account
      return res.status(403).send({
        error: "Failed to complete account for complete user"
      });
    }

    if (providerAuthToken) {
      await validateProviderAuthToken({
        email,
        providerAuthToken
      });
    } else {
      const [AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE] = <[string, string]>(
        req.headers["authorization"]?.split(" ", 2)
      ) ?? [null, null];
      if (AUTH_TOKEN_TYPE === null) {
        throw BadRequestError({ message: "Missing Authorization Header in the request header." });
      }
      if (AUTH_TOKEN_TYPE.toLowerCase() !== "bearer") {
        throw BadRequestError({
          message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`
        });
      }
      if (AUTH_TOKEN_VALUE === null) {
        throw BadRequestError({
          message: "Missing Authorization Body in the request header"
        });
      }

      const decodedToken = <jwt.UserIDJwtPayload>(
        jwt.verify(AUTH_TOKEN_VALUE, await getAuthSecret())
      );
      
      if (decodedToken.authTokenType !== AuthTokenType.SIGNUP_TOKEN) throw UnauthorizedRequestError();
      if (decodedToken.userId !== user.id) throw UnauthorizedRequestError();
    }

    // complete setting up user's account
    user = await completeAccount({
      userId: user._id.toString(),
      firstName,
      lastName,
      encryptionVersion: 2,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      publicKey,
      encryptedPrivateKey,
      encryptedPrivateKeyIV,
      encryptedPrivateKeyTag,
      salt,
      verifier
    });

    if (!user) throw new Error("Failed to complete account for non-existent user"); // ensure user is non-null

    const hasSamlEnabled = user.authMethods.some((authMethod: AuthMethod) =>
      [AuthMethod.OKTA_SAML, AuthMethod.AZURE_SAML, AuthMethod.JUMPCLOUD_SAML].includes(authMethod)
    );

    if (!hasSamlEnabled) {
      // TODO: modify this part
      // initialize default organization and workspace
      await initializeDefaultOrg({
        organizationName,
        user
      });
    }

    // update organization membership statuses that are
    // invited to completed with user attached
    await MembershipOrg.updateMany(
      {
        inviteEmail: email,
        status: INVITED
      },
      {
        user,
        status: ACCEPTED
      }
    );

    // issue tokens
    const tokens = await issueAuthTokens({
      userId: user._id,
      ip: req.realIP,
      userAgent: req.headers["user-agent"] ?? ""
    });

    token = tokens.token;

    // sending a welcome email to new users
    if (await getLoopsApiKey()) {
      await standardRequest.post(
        "https://app.loops.so/api/v1/events/send",
        {
          email: email,
          eventName: "Sign Up",
          firstName: firstName,
          lastName: lastName
        },
        {
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + (await getLoopsApiKey())
          }
        }
      );
    }

    // store (refresh) token in httpOnly cookie
    res.cookie("jid", tokens.refreshToken, {
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: await getHttpsEnabled()
    });

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "User Signed Up",
        distinctId: email,
        properties: {
          email,
          ...(attributionSource ? { attributionSource } : {})
        }
      });
    }
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    return res.status(400).send({
      message: "Failed to complete account setup"
    });
  }

  return res.status(200).send({
    message: "Successfully set up account",
    user,
    token
  });
};
