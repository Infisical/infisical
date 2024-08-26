import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { OrgMembershipStatus, TableName } from "@app/db/schemas";
import { convertPendingGroupAdditionsToGroupMemberships } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { isDisposableEmail } from "@app/lib/validator";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenMetadataType, TokenType, TTokenMetadata } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { addMembersToProject } from "../project-membership/project-membership-fns";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TAuthDALFactory } from "./auth-dal";
import { validateProviderAuthToken, validateSignUpAuthorization } from "./auth-fns";
import { TCompleteAccountInviteDTO, TCompleteAccountSignupDTO } from "./auth-signup-type";
import { AuthMethod, AuthTokenType } from "./auth-type";

type TAuthSignupDep = {
  authDAL: TAuthDALFactory;
  userDAL: TUserDALFactory;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    | "find"
    | "transaction"
    | "insertMany"
    | "deletePendingUserGroupMembershipsByUserIds"
    | "findUserGroupMembershipsInProject"
  >;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findProjectById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find" | "transaction" | "insertMany">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "insertMany">;
};

export type TAuthSignupFactory = ReturnType<typeof authSignupServiceFactory>;
export const authSignupServiceFactory = ({
  authDAL,
  userDAL,
  userGroupMembershipDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  groupProjectDAL,
  tokenService,
  smtpService,
  orgService,
  orgDAL,
  projectMembershipDAL,
  projectUserMembershipRoleDAL,
  licenseService
}: TAuthSignupDep) => {
  // first step of signup. create user and send email
  const beginEmailSignupProcess = async (email: string) => {
    const isEmailInvalid = await isDisposableEmail(email);
    if (isEmailInvalid) {
      throw new Error("Provided a disposable email");
    }

    let user = await userDAL.findUserByUsername(email);
    if (user && user.isAccepted) {
      // TODO(akhilmhdh-pg): copy as old one. this needs to be changed due to security issues
      throw new Error("Failed to send verification code for complete account");
    }
    if (!user) {
      user = await userDAL.create({ authMethods: [AuthMethod.EMAIL], username: email, email, isGhost: false });
    }
    if (!user) throw new Error("Failed to create user");

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_CONFIRMATION,
      userId: user.id
    });

    await smtpService.sendMail({
      template: SmtpTemplates.SignupEmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [user.email as string],
      substitutions: {
        code: token
      }
    });
  };

  const verifyEmailSignup = async (email: string, code: string) => {
    const user = await userDAL.findUserByUsername(email);
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

    await userDAL.updateById(user.id, { isEmailVerified: true });

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
    password,
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
    const appCfg = getConfig();
    const user = await userDAL.findOne({ username: email });
    if (!user || (user && user.isAccepted)) {
      throw new Error("Failed to complete account for complete user");
    }

    let organizationId: string | null = null;
    let authMethod: AuthMethod | null = null;
    if (providerAuthToken) {
      const { orgId, authMethod: userAuthMethod } = validateProviderAuthToken(providerAuthToken, user.username);
      authMethod = userAuthMethod;
      organizationId = orgId;
    } else {
      validateSignUpAuthorization(authorization, user.id);
    }

    const hashedPassword = await bcrypt.hash(password, appCfg.BCRYPT_SALT_ROUND);
    const privateKey = await getUserPrivateKey(password, {
      salt,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      encryptedPrivateKey,
      iv: encryptedPrivateKeyIV,
      tag: encryptedPrivateKeyTag,
      encryptionVersion: 2
    });
    const { tag, encoding, ciphertext, iv } = infisicalSymmetricEncypt(privateKey);
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
          tag: encryptedPrivateKeyTag,
          hashedPassword,
          serverEncryptedPrivateKeyEncoding: encoding,
          serverEncryptedPrivateKeyTag: tag,
          serverEncryptedPrivateKeyIV: iv,
          serverEncryptedPrivateKey: ciphertext
        },
        tx
      );
      // If it's SAML Auth and the organization ID is present, we should check if the user has a pending invite for this org, and accept it
      if (
        (isAuthMethodSaml(authMethod) || [AuthMethod.LDAP, AuthMethod.OIDC].includes(authMethod as AuthMethod)) &&
        organizationId
      ) {
        const [pendingOrgMembership] = await orgDAL.findMembership({
          [`${TableName.OrgMembership}.userId` as "userId"]: user.id,
          status: OrgMembershipStatus.Invited,
          [`${TableName.OrgMembership}.orgId` as "orgId"]: organizationId
        });

        if (pendingOrgMembership) {
          await orgDAL.updateMembershipById(
            pendingOrgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }
      }

      return { info: us, key: userEncKey };
    });

    if (!organizationId) {
      const newOrganization = await orgService.createOrganization({
        userId: user.id,
        userEmail: user.email ?? user.username,
        orgName: organizationName
      });

      if (!newOrganization) throw new Error("Failed to create organization");

      organizationId = newOrganization.id;
    }

    const updatedMembersips = await orgDAL.updateMembership(
      { inviteEmail: email, status: OrgMembershipStatus.Invited },
      { userId: user.id, status: OrgMembershipStatus.Accepted }
    );
    const uniqueOrgId = [...new Set(updatedMembersips.map(({ orgId }) => orgId))];
    await Promise.allSettled(uniqueOrgId.map((orgId) => licenseService.updateSubscriptionOrgMemberCount(orgId)));

    await convertPendingGroupAdditionsToGroupMemberships({
      userIds: [user.id],
      userDAL,
      userGroupMembershipDAL,
      groupProjectDAL,
      projectKeyDAL,
      projectDAL,
      projectBotDAL
    });

    const tokenSession = await tokenService.getUserTokenSession({
      userAgent,
      ip,
      userId: updateduser.info.id
    });
    if (!tokenSession) throw new Error("Failed to create token");

    const accessToken = jwt.sign(
      {
        authMethod: authMethod || AuthMethod.EMAIL,
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
        authMethod: authMethod || AuthMethod.EMAIL,
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: updateduser.info.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion,
        organizationId
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_REFRESH_LIFETIME }
    );

    return { user: updateduser.info, accessToken, refreshToken, organizationId };
  };

  /*
   * User signup flow when they are invited to join the org
   * */
  const completeAccountInvite = async ({
    ip,
    salt,
    email,
    password,
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
    authorization,
    tokenMetadata
  }: TCompleteAccountInviteDTO) => {
    const user = await userDAL.findUserByUsername(email);
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

    const appCfg = getConfig();
    const hashedPassword = await bcrypt.hash(password, appCfg.BCRYPT_SALT_ROUND);
    const privateKey = await getUserPrivateKey(password, {
      salt,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      encryptedPrivateKey,
      iv: encryptedPrivateKeyIV,
      tag: encryptedPrivateKeyTag,
      encryptionVersion: 2
    });
    const { tag, encoding, ciphertext, iv } = infisicalSymmetricEncypt(privateKey);
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
          tag: encryptedPrivateKeyTag,
          hashedPassword,
          serverEncryptedPrivateKeyEncoding: encoding,
          serverEncryptedPrivateKeyTag: tag,
          serverEncryptedPrivateKeyIV: iv,
          serverEncryptedPrivateKey: ciphertext
        },
        tx
      );

      if (tokenMetadata) {
        const metadataObj = jwt.verify(tokenMetadata, appCfg.AUTH_SECRET) as TTokenMetadata;

        if (
          metadataObj?.payload?.userId !== user.id ||
          metadataObj?.payload?.orgId !== orgMembership.orgId ||
          metadataObj?.type !== TokenMetadataType.InviteToProjects
        ) {
          throw new UnauthorizedError({
            message: "Malformed or invalid metadata token"
          });
        }

        for await (const projectId of metadataObj.payload.projectIds) {
          await addMembersToProject({
            orgDAL,
            projectDAL,
            projectMembershipDAL,
            projectKeyDAL,
            userGroupMembershipDAL,
            projectBotDAL,
            projectUserMembershipRoleDAL,
            smtpService
          }).addMembersToNonE2EEProject(
            {
              emails: [user.email!],
              usernames: [],
              projectId,
              projectMembershipRole: metadataObj.payload.projectRoleSlug,
              sendEmails: false
            },
            {
              tx,
              throwOnProjectNotFound: false
            }
          );
        }
      }

      const updatedMembersips = await orgDAL.updateMembership(
        { inviteEmail: email, status: OrgMembershipStatus.Invited },
        { userId: us.id, status: OrgMembershipStatus.Accepted },
        tx
      );
      const uniqueOrgId = [...new Set(updatedMembersips.map(({ orgId }) => orgId))];
      await Promise.allSettled(uniqueOrgId.map((orgId) => licenseService.updateSubscriptionOrgMemberCount(orgId, tx)));

      await convertPendingGroupAdditionsToGroupMemberships({
        userIds: [user.id],
        userDAL,
        userGroupMembershipDAL,
        groupProjectDAL,
        projectKeyDAL,
        projectDAL,
        projectBotDAL,
        tx
      });

      return { info: us, key: userEncKey };
    });

    const tokenSession = await tokenService.getUserTokenSession({
      userAgent,
      ip,
      userId: updateduser.info.id
    });
    if (!tokenSession) throw new Error("Failed to create token");

    const accessToken = jwt.sign(
      {
        authMethod: AuthMethod.EMAIL,
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
        authMethod: AuthMethod.EMAIL,
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
