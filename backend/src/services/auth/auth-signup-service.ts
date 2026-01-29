import { AccessScope, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { convertPendingGroupAdditionsToGroupMemberships } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { getMinExpiresIn } from "@app/lib/fn";
import { isDisposableEmail } from "@app/lib/validator";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TMembershipGroupDALFactory } from "../membership-group/membership-group-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
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
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findProjectById" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  orgService: Pick<TOrgServiceFactory, "createOrganization" | "findOrganizationById">;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  membershipGroupDAL: TMembershipGroupDALFactory;
};

export type TAuthSignupFactory = ReturnType<typeof authSignupServiceFactory>;
export const authSignupServiceFactory = ({
  authDAL,
  userDAL,
  userGroupMembershipDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tokenService,
  smtpService,
  orgService,
  orgDAL,
  membershipGroupDAL,
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
      // Send informational email for existing accounts instead of throwing error
      // This prevents user enumeration vulnerability
      const appCfg = getConfig();
      await smtpService.sendMail({
        template: SmtpTemplates.SignupExistingAccount,
        subjectLine: "Sign-up Request for Your Infisical Account",
        recipients: [sanitizedEmail],
        substitutions: {
          email: sanitizedEmail,
          loginUrl: `${appCfg.SITE_URL}/login`,
          resetPasswordUrl: `${appCfg.SITE_URL}/account-recovery`
        }
      });
      return;
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
    const jwtToken = crypto.jwt().sign(
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
    organizationName,
    // attributionSource,
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

    const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);
    const updateduser = await authDAL.transaction(async (tx) => {
      const duplicateUsers = await userDAL.find(
        {
          email: user.email || sanitizedEmail,
          isAccepted: false
        },
        { tx }
      );
      const nonAcceptedDuplicateUserIds = duplicateUsers
        .filter((duplicateUser) => duplicateUser.id !== user.id)
        .map((duplicateUser) => duplicateUser.id);
      if (nonAcceptedDuplicateUserIds.length > 0) {
        await userDAL.delete(
          {
            $in: {
              id: nonAcceptedDuplicateUserIds
            }
          },
          tx
        );
      }

      const us = await userDAL.updateById(user.id, { firstName, lastName, isAccepted: true }, tx);
      if (!us) throw new Error("User not found");

      const userEncKey = await userDAL.upsertUserEncryptionKey(
        us.id,
        {
          encryptionVersion: UserEncryption.V2,
          hashedPassword
        },
        tx
      );

      // If it's SAML Auth and the organization ID is present, we should check if the user has a pending invite for this org, and accept it
      if (
        (isAuthMethodSaml(authMethod) || [AuthMethod.LDAP, AuthMethod.OIDC].includes(authMethod as AuthMethod)) &&
        organizationId
      ) {
        const [pendingOrgMembership] = await orgDAL.findMembership({
          [`${TableName.Membership}.actorUserId` as "actorUserId"]: user.id,
          status: OrgMembershipStatus.Invited,
          [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: organizationId,
          [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
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
      { inviteEmail: sanitizedEmail, status: OrgMembershipStatus.Invited, scope: AccessScope.Organization },
      { actorUserId: user.id, status: OrgMembershipStatus.Accepted }
    );
    const uniqueOrgId = [...new Set(updatedMembersips.map(({ scopeOrgId }) => scopeOrgId))];
    await Promise.allSettled(uniqueOrgId.map((orgId) => licenseService.updateSubscriptionOrgMemberCount(orgId)));

    await convertPendingGroupAdditionsToGroupMemberships({
      userIds: [user.id],
      userDAL,
      userGroupMembershipDAL,
      projectKeyDAL,
      membershipGroupDAL,
      projectDAL,
      projectBotDAL
    });

    let tokenSessionExpiresIn: string | number = appCfg.JWT_AUTH_LIFETIME;
    let refreshTokenExpiresIn: string | number = appCfg.JWT_REFRESH_LIFETIME;

    if (organizationId) {
      const org = await orgService.findOrganizationById({
        userId: user.id,
        orgId: organizationId,
        actorAuthMethod: authMethod,
        actorOrgId: organizationId,
        rootOrgId: organizationId
      });
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

    const accessToken = crypto.jwt().sign(
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

    const refreshToken = crypto.jwt().sign(
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
    password,
    firstName,
    userAgent,
    lastName,
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
    const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);
    const updateduser = await authDAL.transaction(async (tx) => {
      const duplicateUsers = await userDAL.find(
        {
          email: user.email || sanitizedEmail,
          isAccepted: false
        },
        { tx }
      );
      const nonAcceptedDuplicateUserIds = duplicateUsers
        .filter((duplicateUser) => duplicateUser.id !== user.id)
        .map((duplicateUser) => duplicateUser.id);
      if (nonAcceptedDuplicateUserIds.length > 0) {
        await userDAL.delete(
          {
            $in: {
              id: nonAcceptedDuplicateUserIds
            }
          },
          tx
        );
      }

      const us = await userDAL.updateById(user.id, { firstName, lastName, isAccepted: true }, tx);
      if (!us) throw new Error("User not found");
      const userEncKey = await userDAL.upsertUserEncryptionKey(
        us.id,
        {
          encryptionVersion: 2,
          hashedPassword
        },
        tx
      );

      const updatedMembersips = await orgDAL.updateMembership(
        { inviteEmail: sanitizedEmail, status: OrgMembershipStatus.Invited, scope: AccessScope.Organization },
        { actorUserId: us.id, status: OrgMembershipStatus.Accepted },
        tx
      );
      const uniqueOrgId = [...new Set(updatedMembersips.map(({ scopeOrgId }) => scopeOrgId))];
      await Promise.allSettled(uniqueOrgId.map((orgId) => licenseService.updateSubscriptionOrgMemberCount(orgId, tx)));

      await convertPendingGroupAdditionsToGroupMemberships({
        userIds: [user.id],
        userDAL,
        userGroupMembershipDAL,
        projectKeyDAL,
        projectDAL,
        projectBotDAL,
        membershipGroupDAL,
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

    const accessToken = crypto.jwt().sign(
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

    const refreshToken = crypto.jwt().sign(
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
