import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { OrgMembershipStatus, SecretKeyEncoding, TableName } from "@app/db/schemas";
import { convertPendingGroupAdditionsToGroupMemberships } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { generateUserSrpKeys, getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { getMinExpiresIn } from "@app/lib/fn";
import { isDisposableEmail } from "@app/lib/validator";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { getServerCfg } from "../super-admin/super-admin-service";
import { TUserDALFactory } from "../user/user-dal";
import { UserEncryption } from "../user/user-types";
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
  orgService: Pick<TOrgServiceFactory, "createOrganization" | "findOrganizationById">;
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
  licenseService
}: TAuthSignupDep) => {
  // first step of signup. create user and send email
  const beginEmailSignupProcess = async (email: string) => {
    const sanitizedEmail = email.trim().toLowerCase();
    const isEmailInvalid = await isDisposableEmail(sanitizedEmail);
    if (isEmailInvalid) {
      throw new Error("Provided a disposable email");
    }

    // akhilmhdh: case sensitive email resolution
    const usersByUsername = await userDAL.findUserByUsername(sanitizedEmail);
    let user =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === sanitizedEmail) : usersByUsername?.[0];
    if (user && user.isAccepted) {
      // TODO(akhilmhdh-pg): copy as old one. this needs to be changed due to security issues
      throw new BadRequestError({ message: "Failed to send verification code for complete account" });
    }
    if (!user) {
      user = await userDAL.create({
        authMethods: [AuthMethod.EMAIL],
        username: sanitizedEmail,
        email: sanitizedEmail,
        isGhost: false
      });
    }
    if (!user) throw new Error("Failed to create user");

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_CONFIRMATION,
      userId: user.id
    });

    await smtpService.sendMail({
      template: SmtpTemplates.SignupEmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [sanitizedEmail],
      substitutions: {
        code: token
      }
    });
  };

  const verifyEmailSignup = async (email: string, code: string) => {
    const sanitizedEmail = email.trim().toLowerCase();
    const usersByUsername = await userDAL.findUserByUsername(sanitizedEmail);
    const user =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === sanitizedEmail) : usersByUsername?.[0];
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
    authorization,
    useDefaultOrg
  }: TCompleteAccountSignupDTO) => {
    const sanitizedEmail = email.trim().toLowerCase();
    const appCfg = getConfig();
    const serverCfg = await getServerCfg();

    const usersByUsername = await userDAL.findUserByUsername(sanitizedEmail);
    const user =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === sanitizedEmail) : usersByUsername?.[0];
    if (!user || (user && user.isAccepted)) {
      throw new BadRequestError({ message: "Failed to complete account for complete user" });
    }

    let organizationId: string | null = null;
    let authMethod: AuthMethod | null = null;
    if (providerAuthToken) {
      const { orgId, authMethod: userAuthMethod } = validateProviderAuthToken(providerAuthToken, user.username);
      authMethod = userAuthMethod;
      organizationId = orgId;
    } else {
      // disallow signup if disabled. we are not doing this for providerAuthToken because we allow signups via saml or sso
      if (!serverCfg.allowSignUp) {
        throw new ForbiddenRequestError({
          message: "Signup's are disabled"
        });
      }
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
      encryptionVersion: UserEncryption.V2
    });
    const { tag, encoding, ciphertext, iv } = infisicalSymmetricEncypt(privateKey);
    const updateduser = await authDAL.transaction(async (tx) => {
      const us = await userDAL.updateById(user.id, { firstName, lastName, isAccepted: true }, tx);
      if (!us) throw new Error("User not found");
      const systemGeneratedUserEncryptionKey = await userDAL.findUserEncKeyByUserId(us.id, tx);
      let userEncKey;

      // below condition is true means this is system generated credentials
      // the private key is actually system generated password
      // thus we will re-encrypt the system generated private key with the new password
      // akhilmhdh: you may find this like why? The reason is simple we are moving away from e2ee and these are pieces of it
      // without a dummy key in place some things will break and backward compatiability too. 2025 we will be removing all these things
      if (
        systemGeneratedUserEncryptionKey &&
        !systemGeneratedUserEncryptionKey.hashedPassword &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKey &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyTag &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyIV &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyEncoding
      ) {
        // get server generated password
        const serverGeneratedPassword = infisicalSymmetricDecrypt({
          iv: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyIV,
          tag: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyTag,
          ciphertext: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKey,
          keyEncoding: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyEncoding as SecretKeyEncoding
        });
        const serverGeneratedPrivateKey = await getUserPrivateKey(serverGeneratedPassword, {
          ...systemGeneratedUserEncryptionKey
        });
        const encKeys = await generateUserSrpKeys(email, password, {
          publicKey: systemGeneratedUserEncryptionKey.publicKey,
          privateKey: serverGeneratedPrivateKey
        });
        // now reencrypt server generated key with user provided password
        userEncKey = await userDAL.upsertUserEncryptionKey(
          us.id,
          {
            encryptionVersion: UserEncryption.V2,
            protectedKey: encKeys.protectedKey,
            protectedKeyIV: encKeys.protectedKeyIV,
            protectedKeyTag: encKeys.protectedKeyTag,
            publicKey: encKeys.publicKey,
            encryptedPrivateKey: encKeys.encryptedPrivateKey,
            iv: encKeys.encryptedPrivateKeyIV,
            tag: encKeys.encryptedPrivateKeyTag,
            salt: encKeys.salt,
            verifier: encKeys.verifier,
            hashedPassword,
            serverEncryptedPrivateKeyEncoding: encoding,
            serverEncryptedPrivateKeyTag: tag,
            serverEncryptedPrivateKeyIV: iv,
            serverEncryptedPrivateKey: ciphertext
          },
          tx
        );
      } else {
        userEncKey = await userDAL.upsertUserEncryptionKey(
          us.id,
          {
            encryptionVersion: UserEncryption.V2,
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
      }

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
      let orgId = "";
      if (useDefaultOrg && serverCfg.defaultAuthOrgId && !appCfg.isCloud) {
        const defaultOrg = await orgDAL.findOrgById(serverCfg.defaultAuthOrgId);
        if (!defaultOrg) throw new BadRequestError({ message: "Failed to find default organization" });
        orgId = defaultOrg.id;
      } else {
        if (!organizationName) throw new BadRequestError({ message: "Organization name is required" });
        const newOrganization = await orgService.createOrganization({
          userId: user.id,
          userEmail: user.email ?? user.username,
          orgName: organizationName
        });

        if (!newOrganization) throw new Error("Failed to create organization");
        orgId = newOrganization.id;
      }

      organizationId = orgId;
    }

    const updatedMembersips = await orgDAL.updateMembership(
      { inviteEmail: sanitizedEmail, status: OrgMembershipStatus.Invited },
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

    let tokenSessionExpiresIn: string | number = appCfg.JWT_AUTH_LIFETIME;
    let refreshTokenExpiresIn: string | number = appCfg.JWT_REFRESH_LIFETIME;

    if (organizationId) {
      const org = await orgService.findOrganizationById(user.id, organizationId, authMethod, organizationId);
      if (org && org.userTokenExpiration) {
        tokenSessionExpiresIn = getMinExpiresIn(appCfg.JWT_AUTH_LIFETIME, org.userTokenExpiration);
        refreshTokenExpiresIn = org.userTokenExpiration;
      }
    }

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
      { expiresIn: tokenSessionExpiresIn }
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
      { expiresIn: refreshTokenExpiresIn }
    );

    return { user: updateduser.info, accessToken, refreshToken, organizationId };
  };

  /*
   * User signup flow when they are invited to join the org
   * */
  const completeAccountInvite = async ({
    email,
    ip,
    salt,
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
    authorization
  }: TCompleteAccountInviteDTO) => {
    const sanitizedEmail = email.trim().toLowerCase();
    const usersByUsername = await userDAL.findUserByUsername(sanitizedEmail);
    const user =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === sanitizedEmail) : usersByUsername?.[0];
    if (!user || (user && user.isAccepted)) {
      throw new Error("Failed to complete account for complete user");
    }

    validateSignUpAuthorization(authorization, user.id);

    const [orgMembership] = await orgDAL.findMembership({
      inviteEmail: sanitizedEmail,
      status: OrgMembershipStatus.Invited
    });
    if (!orgMembership)
      throw new NotFoundError({
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
      const systemGeneratedUserEncryptionKey = await userDAL.findUserEncKeyByUserId(us.id, tx);
      let userEncKey;
      // this means this is system generated credentials
      // now replace the private key
      if (
        systemGeneratedUserEncryptionKey &&
        !systemGeneratedUserEncryptionKey.hashedPassword &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKey &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyTag &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyIV &&
        systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyEncoding
      ) {
        // get server generated password
        const serverGeneratedPassword = infisicalSymmetricDecrypt({
          iv: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyIV,
          tag: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyTag,
          ciphertext: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKey,
          keyEncoding: systemGeneratedUserEncryptionKey.serverEncryptedPrivateKeyEncoding as SecretKeyEncoding
        });
        const serverGeneratedPrivateKey = await getUserPrivateKey(serverGeneratedPassword, {
          ...systemGeneratedUserEncryptionKey
        });
        const encKeys = await generateUserSrpKeys(sanitizedEmail, password, {
          publicKey: systemGeneratedUserEncryptionKey.publicKey,
          privateKey: serverGeneratedPrivateKey
        });
        // now reencrypt server generated key with user provided password
        userEncKey = await userDAL.upsertUserEncryptionKey(
          us.id,
          {
            encryptionVersion: 2,
            protectedKey: encKeys.protectedKey,
            protectedKeyIV: encKeys.protectedKeyIV,
            protectedKeyTag: encKeys.protectedKeyTag,
            publicKey: encKeys.publicKey,
            encryptedPrivateKey: encKeys.encryptedPrivateKey,
            iv: encKeys.encryptedPrivateKeyIV,
            tag: encKeys.encryptedPrivateKeyTag,
            salt: encKeys.salt,
            verifier: encKeys.verifier,
            hashedPassword,
            serverEncryptedPrivateKeyEncoding: encoding,
            serverEncryptedPrivateKeyTag: tag,
            serverEncryptedPrivateKeyIV: iv,
            serverEncryptedPrivateKey: ciphertext
          },
          tx
        );
      } else {
        userEncKey = await userDAL.upsertUserEncryptionKey(
          us.id,
          {
            encryptionVersion: UserEncryption.V2,
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
      }

      const updatedMembersips = await orgDAL.updateMembership(
        { inviteEmail: sanitizedEmail, status: OrgMembershipStatus.Invited },
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
