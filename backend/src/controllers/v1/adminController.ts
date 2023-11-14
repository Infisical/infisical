import { Request, Response } from "express";
import { getHttpsEnabled } from "../../config";
import { getServerConfig, updateServerConfig as setServerConfig } from "../../config/serverConfig";
import { initializeDefaultOrg, issueAuthTokens } from "../../helpers";
import { validateRequest } from "../../helpers/validation";
import { User } from "../../models";
import { TelemetryService } from "../../services";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import * as reqValidator from "../../validation/admin";

export const getServerConfigInfo = (_req: Request, res: Response) => {
  const config = getServerConfig();
  return res.send({ config });
};

export const updateServerConfig = async (req: Request, res: Response) => {
  const {
    body: { allowSignUp }
  } = await validateRequest(reqValidator.UpdateServerConfigV1, req);
  const config = await setServerConfig({ allowSignUp });
  return res.send({ config });
};

export const adminSignUp = async (req: Request, res: Response) => {
  const cfg = getServerConfig();
  if (cfg.initialized) throw UnauthorizedRequestError({ message: "Admin has been created" });
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
      encryptedPrivateKey,
      encryptedPrivateKeyIV,
      encryptedPrivateKeyTag
    }
  } = await validateRequest(reqValidator.SignupV1, req);
  let user = await User.findOne({ email });
  if (user) throw BadRequestError({ message: "User already exist" });
  user = new User({
    email,
    firstName,
    lastName,
    encryptionVersion: 2,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    publicKey,
    encryptedPrivateKey,
    iv: encryptedPrivateKeyIV,
    tag: encryptedPrivateKeyTag,
    salt,
    verifier,
    superAdmin: true
  });
  await user.save();
  await initializeDefaultOrg({ organizationName: "Admin Org", user });

  await setServerConfig({ initialized: true });

  // issue tokens
  const tokens = await issueAuthTokens({
    userId: user._id,
    ip: req.realIP,
    userAgent: req.headers["user-agent"] ?? ""
  });

  const token = tokens.token;

  const postHogClient = await TelemetryService.getPostHogClient();
  if (postHogClient) {
    postHogClient.capture({
      event: "admin initialization",
      properties: {
        email: user.email,
        lastName,
        firstName
      }
    });
  }

  // store (refresh) token in httpOnly cookie
  res.cookie("jid", tokens.refreshToken, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: await getHttpsEnabled()
  });

  return res.status(200).send({
    message: "Successfully set up admin account",
    user,
    token
  });
};
