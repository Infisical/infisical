import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, OrganizationActionScope } from "@app/db/schemas/models";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { AuthMethod, AuthTokenType } from "../auth/auth-type";
import { TGroupProjectDALFactory } from "../group-project/group-project-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { TUserDALFactory } from "./user-dal";
import { TListUserGroupsDTO, TUpdateUserEmailDTO, TUpdateUserMfaDTO } from "./user-types";

type TUserServiceFactoryDep = {
  userDAL: Pick<
    TUserDALFactory,
    | "find"
    | "findUserByUsername"
    | "findById"
    | "transaction"
    | "updateById"
    | "update"
    | "deleteById"
    | "findOneUserAction"
    | "createUserAction"
    | "findUserEncKeyByUserId"
    | "delete"
    | "findAllMyAccounts"
  >;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "findByUserId">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "find">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find" | "insertMany" | "findOne" | "updateById">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser" | "revokeAllMySessions">;
  smtpService: Pick<TSmtpService, "sendMail">;
  permissionService: TPermissionServiceFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "find" | "updateById" | "delete">;
};

export type TUserServiceFactory = ReturnType<typeof userServiceFactory>;

export const userServiceFactory = ({
  userDAL,
  orgDAL,
  membershipUserDAL,
  groupProjectDAL,
  tokenService,
  smtpService,
  permissionService,
  userAliasDAL
}: TUserServiceFactoryDep) => {
  const sendEmailVerificationCode = async (token: string) => {
    const { authType, aliasId, username, authTokenType } = crypto.jwt().decode(token) as {
      authType: string;
      aliasId?: string;
      username: string;
      authTokenType: AuthTokenType;
    };
    if (authTokenType !== AuthTokenType.PROVIDER_TOKEN) throw new BadRequestError({ name: "Invalid auth token type" });

    // akhilmhdh: case sensitive email resolution
    const users = await userDAL.findUserByUsername(username);
    const user = users?.length > 1 ? users.find((el) => el.username === username) : users?.[0];
    if (!user) throw new NotFoundError({ name: `User with username '${username}' not found` });
    let { isEmailVerified } = user;
    if (aliasId) {
      const userAlias = await userAliasDAL.findOne({ userId: user.id, aliasType: authType, id: aliasId });
      if (!userAlias) throw new NotFoundError({ name: `User alias with ID '${aliasId}' not found` });
      isEmailVerified = userAlias.isEmailVerified;
    }

    if (!user.email)
      throw new BadRequestError({ name: "Failed to send email verification code due to no email on user" });
    if (isEmailVerified)
      throw new BadRequestError({ name: "Failed to send email verification code due to email already verified" });

    const userToken = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id,
      aliasId
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [user.email],
      substitutions: {
        code: userToken
      }
    });
  };

  const verifyEmailVerificationCode = async (username: string, code: string) => {
    // akhilmhdh: case sensitive email resolution
    const usersByusername = await userDAL.findUserByUsername(username);

    logger.info(
      usersByusername.map((user) => ({
        id: user.id,
        email: user.email,
        username: user.username,
        isEmailVerified: user.isEmailVerified
      })),
      `Verify email users: [username=${username}]`
    );

    const user =
      usersByusername?.length > 1 ? usersByusername.find((el) => el.username === username) : usersByusername?.[0];
    if (!user) throw new NotFoundError({ name: `User with username '${username}' not found` });
    if (!user.email)
      throw new BadRequestError({ name: "Failed to verify email verification code due to no email on user" });

    const token = await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id,
      code
    });

    if (token?.aliasId) {
      const userAlias = await userAliasDAL.findOne({ userId: user.id, id: token.aliasId });
      if (!userAlias) throw new NotFoundError({ name: `User alias with ID '${token.aliasId}' not found` });
      if (userAlias?.isEmailVerified)
        throw new BadRequestError({ name: "Failed to verify email verification code due to email already verified" });

      await userAliasDAL.updateById(token.aliasId, { isEmailVerified: true });
    }
    const userEmails = user?.email ? await userDAL.find({ email: user.email }) : [];

    await userDAL.updateById(user.id, {
      isEmailVerified: true,
      username: userEmails?.length === 1 && userEmails?.[0]?.id === user.id ? user.email.toLowerCase() : undefined
    });
  };

  const updateUserMfa = async ({ userId, isMfaEnabled, selectedMfaMethod }: TUpdateUserMfaDTO) => {
    const user = await userDAL.findById(userId);

    if (!user || !user.email) throw new BadRequestError({ name: "Failed to toggle MFA" });

    let mfaMethods;
    if (isMfaEnabled === undefined) {
      mfaMethods = undefined;
    } else {
      mfaMethods = isMfaEnabled ? ["email"] : [];
    }

    const updatedUser = await userDAL.updateById(userId, {
      isMfaEnabled,
      mfaMethods,
      selectedMfaMethod
    });

    return updatedUser;
  };

  const updateUserName = async (userId: string, firstName: string, lastName: string) => {
    const updatedUser = await userDAL.updateById(userId, {
      firstName,
      lastName
    });
    return updatedUser;
  };

  const updateAuthMethods = async (userId: string, authMethods: AuthMethod[]) => {
    const user = await userDAL.findById(userId);
    if (!user) throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "UpdateAuthMethods" });

    if (user.authMethods?.includes(AuthMethod.LDAP) || authMethods.includes(AuthMethod.LDAP)) {
      throw new BadRequestError({ message: "LDAP auth method cannot be updated", name: "UpdateAuthMethods" });
    }

    const updatedUser = await userDAL.updateById(userId, { authMethods });
    return updatedUser;
  };

  const checkUserScimRestriction = async (userId: string, tx?: Knex) => {
    const userOrgs = await membershipUserDAL.find(
      {
        actorUserId: userId,
        scope: AccessScope.Organization
      },
      { tx }
    );

    if (userOrgs.length === 0) {
      return false;
    }

    const orgIds = userOrgs.map((membership) => membership.scopeOrgId);
    const organizations = await orgDAL.find({ $in: { id: orgIds } }, { tx });

    return organizations.some((org) => org.scimEnabled);
  };

  const requestEmailChangeOTP = async ({ userId, newEmail }: TUpdateUserEmailDTO) => {
    const startTime = new Date();
    const changeEmailOTP = await userDAL.transaction(async (tx) => {
      const user = await userDAL.findById(userId, tx);
      if (!user)
        throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "RequestEmailChangeOTP" });

      if (user.authMethods?.includes(AuthMethod.LDAP)) {
        throw new BadRequestError({ message: "Cannot update email for LDAP users", name: "RequestEmailChangeOTP" });
      }

      const hasScimRestriction = await checkUserScimRestriction(userId, tx);
      if (hasScimRestriction) {
        throw new BadRequestError({
          message: "Email changes are disabled because SCIM is enabled for one or more of your organizations",
          name: "RequestEmailChangeOTP"
        });
      }

      // Silently check if another user already has this email - don't send OTP if email is taken
      const existingUsers = await userDAL.findUserByUsername(newEmail.toLowerCase(), tx);
      const existingUser = existingUsers?.find((u) => u.id !== userId);
      if (!existingUser) {
        // Generate 6-digit OTP
        const otpCode = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_CHANGE_OTP,
          userId,
          payload: newEmail.toLowerCase()
        });

        // Send OTP to NEW email address
        await smtpService.sendMail({
          template: SmtpTemplates.EmailVerification,
          subjectLine: "Infisical email change verification",
          recipients: [newEmail.toLowerCase()],
          substitutions: {
            code: otpCode
          }
        });
      }

      return { success: true, message: "Verification code sent to new email address" };
    });
    // Force this function to have a minimum execution time of 2 seconds to avoid possible information disclosure about existing users
    const endTime = new Date();
    const timeDiff = endTime.getTime() - startTime.getTime();
    if (timeDiff < 2000) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000 - timeDiff);
      });
    }
    return changeEmailOTP;
  };

  const updateUserEmail = async ({ userId, newEmail, otpCode }: TUpdateUserEmailDTO & { otpCode: string }) => {
    const changedUser = await userDAL.transaction(async (tx) => {
      const user = await userDAL.findById(userId, tx);
      if (!user) throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "UpdateUserEmail" });

      if (user.authMethods?.includes(AuthMethod.LDAP)) {
        throw new BadRequestError({ message: "Cannot update email for LDAP users", name: "UpdateUserEmail" });
      }

      const hasScimRestriction = await checkUserScimRestriction(userId, tx);
      if (hasScimRestriction) {
        throw new BadRequestError({
          message: "You are part of an organization that has SCIM enabled, and email changes are not allowed",
          name: "UpdateUserEmail"
        });
      }

      // Validate OTP and get the new email from token aliasId field
      let tokenData;
      try {
        tokenData = await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_EMAIL_CHANGE_OTP,
          userId,
          code: otpCode
        });
      } catch (error) {
        throw new BadRequestError({ message: "Invalid verification code", name: "UpdateUserEmail" });
      }

      // Verify the new email matches what was stored in payload
      const tokenNewEmail = tokenData?.payload;
      if (!tokenNewEmail || tokenNewEmail !== newEmail.toLowerCase()) {
        throw new BadRequestError({ message: "Invalid verification code", name: "UpdateUserEmail" });
      }

      // Final check if another user has this email
      const existingUsers = await userDAL.findUserByUsername(newEmail.toLowerCase(), tx);
      const existingUser = existingUsers?.find((u) => u.id !== userId);
      if (existingUser) {
        throw new BadRequestError({ message: "Email is no longer available", name: "UpdateUserEmail" });
      }

      // Delete all user aliases since the email is changing
      await userAliasDAL.delete({ userId }, tx);

      // Ensure EMAIL auth method is included if not already present
      const currentAuthMethods = user.authMethods || [];
      const updatedAuthMethods = currentAuthMethods.includes(AuthMethod.EMAIL)
        ? currentAuthMethods
        : [...currentAuthMethods, AuthMethod.EMAIL];

      const updatedUser = await userDAL.updateById(
        userId,
        {
          email: newEmail.toLowerCase(),
          username: newEmail.toLowerCase(),
          authMethods: updatedAuthMethods
        },
        tx
      );

      // Revoke all sessions to force re-login
      await tokenService.revokeAllMySessions(userId);

      return updatedUser;
    });
    return changedUser;
  };

  const getAllMyAccounts = async (email: string, userId: string) => {
    const users = await userDAL.findAllMyAccounts(email);
    return users?.map((el) => ({ ...el, isMyAccount: el.id === userId }));
  };

  const removeMyDuplicateAccounts = async (email: string, userId: string) => {
    const users = await userDAL.find({ email });
    const duplicatedAccounts = users?.filter((el) => el.id !== userId);
    const myAccount = users?.find((el) => el.id === userId);
    if (duplicatedAccounts.length && myAccount) {
      await userDAL.transaction(async (tx) => {
        await userDAL.delete({ $in: { id: duplicatedAccounts?.map((el) => el.id) } }, tx);
        await userDAL.updateById(userId, { username: (myAccount.email || myAccount.username).toLowerCase() }, tx);
      });
    }
  };

  const getMe = async (userId: string) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user) throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "GetMe" });

    return {
      ...user,
      encryptionVersion: user.encryptionVersion!
    };
  };

  const deleteUser = async (userId: string) => {
    const user = await userDAL.deleteById(userId);

    try {
      if (user?.email) {
        // Send email to user to confirm account deletion
        await smtpService.sendMail({
          template: SmtpTemplates.AccountDeletionConfirmation,
          subjectLine: "Your Infisical account has been deleted",
          recipients: [user.email],
          substitutions: {
            email: user.email
          }
        });
      }
    } catch (error) {
      logger.error(error, `Failed to send account deletion confirmation email to ${user.email}`);
    }

    return user;
  };

  // user actions operations
  const createUserAction = async (userId: string, action: string) => {
    const userAction = await userDAL.transaction(async (tx) => {
      const existingAction = await userDAL.findOneUserAction({ action, userId }, tx);
      if (existingAction) return existingAction;
      return userDAL.createUserAction({ action, userId }, tx);
    });

    return userAction;
  };

  const getUserAction = async (userId: string, action: string) => {
    const userAction = await userDAL.findOneUserAction({ action, userId });
    return userAction;
  };

  const unlockUser = async (userId: string, token: string) => {
    await tokenService.validateTokenForUser({
      userId,
      code: token,
      type: TokenType.TOKEN_USER_UNLOCK
    });

    await userDAL.update(
      { id: userId },
      { consecutiveFailedMfaAttempts: 0, isLocked: false, temporaryLockDateEnd: null }
    );
  };

  const getUserProjectFavorites = async (userId: string, orgId: string) => {
    const orgMembership = await membershipUserDAL.findOne({
      scope: AccessScope.Organization,
      actorUserId: userId,
      scopeOrgId: orgId
    });

    if (!orgMembership) {
      throw new ForbiddenRequestError({
        message: "User does not belong in the organization."
      });
    }

    return { projectFavorites: orgMembership.projectFavorites || [] };
  };

  const updateUserProjectFavorites = async (userId: string, orgId: string, projectIds: string[]) => {
    const orgMembership = await membershipUserDAL.findOne({
      scope: AccessScope.Organization,
      actorUserId: userId,
      scopeOrgId: orgId
    });

    if (!orgMembership) {
      throw new ForbiddenRequestError({
        message: "User does not belong in the organization."
      });
    }

    const matchingUserProjectMemberships = await membershipUserDAL.find({
      scope: AccessScope.Project,
      scopeOrgId: orgId,
      actorUserId: userId,
      $in: {
        scopeProjectId: projectIds
      }
    });

    const memberProjectFavorites = matchingUserProjectMemberships.map(
      (projectMembership) => projectMembership.scopeProjectId as string
    );

    const updatedOrgMembership = await membershipUserDAL.updateById(orgMembership.id, {
      projectFavorites: memberProjectFavorites
    });

    return updatedOrgMembership.projectFavorites;
  };

  const listUserGroups = async ({ username, actorOrgId, actor, actorId, actorAuthMethod }: TListUserGroupsDTO) => {
    // akhilmhdh: case sensitive email resolution
    const usersByusername = await userDAL.findUserByUsername(username);
    const user =
      usersByusername?.length > 1 ? usersByusername.find((el) => el.username === username) : usersByusername?.[0];
    if (!user) throw new NotFoundError({ name: `User with username '${username}' not found` });

    // This makes it so the user can always read information about themselves, but no one else if they don't have the Members Read permission.
    if (user.id !== actorId) {
      const { permission } = await permissionService.getOrgPermission({
        actor,
        actorId,
        orgId: actorOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
    }

    const memberships = await groupProjectDAL.findByUserId(user.id, actorOrgId);
    return memberships;
  };

  return {
    sendEmailVerificationCode,
    verifyEmailVerificationCode,
    updateUserMfa,
    updateUserName,
    updateAuthMethods,
    requestEmailChangeOTP,
    updateUserEmail,
    deleteUser,
    getMe,
    createUserAction,
    listUserGroups,
    getUserAction,
    unlockUser,
    getAllMyAccounts,
    getUserProjectFavorites,
    removeMyDuplicateAccounts,
    updateUserProjectFavorites
  };
};
