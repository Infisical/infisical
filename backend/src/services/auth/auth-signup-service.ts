import jwt from "jsonwebtoken";

import { OrgMembershipStatus } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { isDisposableEmail } from "@app/lib/validator";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TAuthDALFactory } from "./auth-dal";
import { validateProviderAuthToken, validateSignUpAuthorization } from "./auth-fns";
import { TCompleteAccountInviteDTO, TCompleteAccountSignupDTO } from "./auth-signup-type";
import { AuthMethod, AuthTokenType } from "./auth-type";

type TAuthSignupDep = {
  authDAL: TAuthDALFactory;
  userDAL: TUserDALFactory;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
};

export type TAuthSignupFactory = ReturnType<typeof authSignupServiceFactory>;
export const authSignupServiceFactory = ({
  authDAL,
  userDAL,
  tokenService,
  smtpService,
  orgService,
  orgDAL,
  licenseService
}: TAuthSignupDep) => {
  // first step of signup. create user and send email
  const beginEmailSignupProcess = async (email: string) => {
    const isEmailInvalid = await isDisposableEmail(email);
    if (isEmailInvalid) {
      throw new Error("Provided a disposable email");
    }

    let user = await userDAL.findUserByEmail(email);
    if (user && user.isAccepted) {
      // TODO(akhilmhdh-pg): copy as old one. this needs to be changed due to security issues
      throw new Error("Failed to send verification code for complete account");
    }
    if (!user) {
      user = await userDAL.create({ authMethods: [AuthMethod.EMAIL], email });
    }
    if (!user) throw new Error("Failed to create user");

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_CONFIRMATION,
      userId: user.id
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [email],
      substitutions: {
        code: token
      }
    });
  };

  const verifyEmailSignup = async (email: string, code: string) => {
    const user = await userDAL.findUserByEmail(email);
    if (!user || (user && user.isAccepted)) {
      // TODO(akhilmhdh): copy as old one. this needs to be changed due to security issues
      throw new Error("Failed to send verification code for complete account");
    }
    const appCfg = getConfig();
    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_CONFIRMATION,
      userId: user.id,
      code
    });

    // generate jwt token this is a temporary token
    const jwtToken = jwt.sign(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id.toString()
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
    );

    return { user, token: jwtToken };
  };

  const completeEmailAccountSignup = async ({
    email,
    firstName,
    lastName,
    providerAuthToken,
    salt,
    verifier,
    publicKey,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    organizationName,
    // attributionSource,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    ip,
    userAgent,
    authorization
  }: TCompleteAccountSignupDTO) => {
    const user = await userDAL.findUserByEmail(email);
    if (!user || (user && user.isAccepted)) {
      throw new Error("Failed to complete account for complete user");
    }

    let organizationId;
    if (providerAuthToken) {
      const { orgId } = validateProviderAuthToken(providerAuthToken, user.email);
      organizationId = orgId;
    } else {
      validateSignUpAuthorization(authorization, user.id);
    }

    const updateduser = await authDAL.transaction(async (tx) => {
      const us = await userDAL.updateById(user.id, { firstName, lastName, isAccepted: true }, tx);
      if (!us) throw new Error("User not found");
      const userEncKey = await userDAL.upsertUserEncryptionKey(
        us.id,
        {
          salt,
          verifier,
          publicKey,
          protectedKey,
          protectedKeyIV,
          protectedKeyTag,
          encryptedPrivateKey,
          iv: encryptedPrivateKeyIV,
          tag: encryptedPrivateKeyTag
        },
        tx
      );
      return { info: us, key: userEncKey };
    });

    if (!organizationId) {
      await orgService.createOrganization(user.id, user.email, organizationName);
    }

    const updatedMembersips = await orgDAL.updateMembership(
      { inviteEmail: email, status: OrgMembershipStatus.Invited },
      { userId: user.id, status: OrgMembershipStatus.Accepted }
    );
    const uniqueOrgId = [...new Set(updatedMembersips.map(({ orgId }) => orgId))];
    await Promise.allSettled(uniqueOrgId.map((orgId) => licenseService.updateSubscriptionOrgMemberCount(orgId)));

    const tokenSession = await tokenService.getUserTokenSession({
      userAgent,
      ip,
      userId: updateduser.info.id
    });
    if (!tokenSession) throw new Error("Failed to create token");
    const appCfg = getConfig();

    const accessToken = jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: updateduser.info.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion,
        organizationId
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_AUTH_LIFETIME }
    );

    const refreshToken = jwt.sign(
      {
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: updateduser.info.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion,
        organizationId
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_REFRESH_LIFETIME }
    );

    return { user: updateduser.info, accessToken, refreshToken };
  };

  /*
   * User signup flow when they are invited to join the org
   * */
  const completeAccountInvite = async ({
    ip,
    salt,
    email,
    verifier,
    firstName,
    publicKey,
    userAgent,
    lastName,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    authorization
  }: TCompleteAccountInviteDTO) => {
    const user = await userDAL.findUserByEmail(email);
    if (!user || (user && user.isAccepted)) {
      throw new Error("Failed to complete account for complete user");
    }

    validateSignUpAuthorization(authorization, user.id);

    const [orgMembership] = await orgDAL.findMembership({
      inviteEmail: email,
      status: OrgMembershipStatus.Invited
    });
    if (!orgMembership)
      throw new BadRequestError({
        message: "Failed to find invitation for email",
        name: "complete account invite"
      });

    const updateduser = await authDAL.transaction(async (tx) => {
      const us = await userDAL.updateById(user.id, { firstName, lastName, isAccepted: true }, tx);
      if (!us) throw new Error("User not found");
      const userEncKey = await userDAL.upsertUserEncryptionKey(
        us.id,
        {
          salt,
          encryptionVersion: 2,
          verifier,
          publicKey,
          protectedKey,
          protectedKeyIV,
          protectedKeyTag,
          encryptedPrivateKey,
          iv: encryptedPrivateKeyIV,
          tag: encryptedPrivateKeyTag
        },
        tx
      );

      const updatedMembersips = await orgDAL.updateMembership(
        { inviteEmail: email, status: OrgMembershipStatus.Invited },
        { userId: us.id, status: OrgMembershipStatus.Accepted },
        tx
      );
      const uniqueOrgId = [...new Set(updatedMembersips.map(({ orgId }) => orgId))];
      await Promise.allSettled(uniqueOrgId.map((orgId) => licenseService.updateSubscriptionOrgMemberCount(orgId)));

      return { info: us, key: userEncKey };
    });

    const tokenSession = await tokenService.getUserTokenSession({
      userAgent,
      ip,
      userId: updateduser.info.id
    });
    if (!tokenSession) throw new Error("Failed to create token");
    const appCfg = getConfig();

    const accessToken = jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: updateduser.info.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
    );

    const refreshToken = jwt.sign(
      {
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: updateduser.info.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
    );

    return { user: updateduser.info, accessToken, refreshToken };
  };

  return {
    beginEmailSignupProcess,
    verifyEmailSignup,
    completeEmailAccountSignup,
    completeAccountInvite
  };
};
