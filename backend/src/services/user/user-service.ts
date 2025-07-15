import { ForbiddenError } from "@casl/ability";

import { SecretKeyEncoding } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { AuthMethod } from "../auth/auth-type";
import { TGroupProjectDALFactory } from "../group-project/group-project-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TUserDALFactory } from "./user-dal";
import { TListUserGroupsDTO, TUpdateUserMfaDTO } from "./user-types";

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
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "find" | "insertMany" | "findOne" | "updateById">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find">;
  smtpService: Pick<TSmtpService, "sendMail">;
  permissionService: TPermissionServiceFactory;
};

export type TUserServiceFactory = ReturnType<typeof userServiceFactory>;

export const userServiceFactory = ({
  userDAL,
  orgMembershipDAL,
  projectMembershipDAL,
  groupProjectDAL,
  tokenService,
  smtpService,
  permissionService
}: TUserServiceFactoryDep) => {
  const sendEmailVerificationCode = async (username: string) => {
    // akhilmhdh: case sensitive email resolution
    const users = await userDAL.findUserByUsername(username);
    const user = users?.length > 1 ? users.find((el) => el.username === username) : users?.[0];
    if (!user) throw new NotFoundError({ name: `User with username '${username}' not found` });

    if (!user.email)
      throw new BadRequestError({ name: "Failed to send email verification code due to no email on user" });
    if (user.isEmailVerified)
      throw new BadRequestError({ name: "Failed to send email verification code due to email already verified" });

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [user.email],
      substitutions: {
        code: token
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
    if (user.isEmailVerified)
      throw new BadRequestError({ name: "Failed to verify email verification code due to email already verified" });

    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id,
      code
    });

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
    return user;
  };

  const deleteUser = async (userId: string) => {
    const user = await userDAL.deleteById(userId);
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

  const getUserPrivateKey = async (userId: string) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user?.serverEncryptedPrivateKey || !user.serverEncryptedPrivateKeyIV || !user.serverEncryptedPrivateKeyTag) {
      throw new NotFoundError({ message: `Private key for user with ID '${userId}' not found` });
    }

    const privateKey = crypto
      .encryption()
      .symmetric()
      .decryptWithRootEncryptionKey({
        ciphertext: user.serverEncryptedPrivateKey,
        tag: user.serverEncryptedPrivateKeyTag,
        iv: user.serverEncryptedPrivateKeyIV,
        keyEncoding: user.serverEncryptedPrivateKeyEncoding as SecretKeyEncoding
      });

    return privateKey;
  };

  const getUserProjectFavorites = async (userId: string, orgId: string) => {
    const orgMembership = await orgMembershipDAL.findOne({
      userId,
      orgId
    });

    if (!orgMembership) {
      throw new ForbiddenRequestError({
        message: "User does not belong in the organization."
      });
    }

    return { projectFavorites: orgMembership.projectFavorites || [] };
  };

  const updateUserProjectFavorites = async (userId: string, orgId: string, projectIds: string[]) => {
    const orgMembership = await orgMembershipDAL.findOne({
      userId,
      orgId
    });

    if (!orgMembership) {
      throw new ForbiddenRequestError({
        message: "User does not belong in the organization."
      });
    }

    const matchingUserProjectMemberships = await projectMembershipDAL.find({
      userId,
      $in: {
        projectId: projectIds
      }
    });

    const memberProjectFavorites = matchingUserProjectMemberships.map(
      (projectMembership) => projectMembership.projectId
    );

    const updatedOrgMembership = await orgMembershipDAL.updateById(orgMembership.id, {
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
      const { permission } = await permissionService.getOrgPermission(
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        actorOrgId
      );
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
    deleteUser,
    getMe,
    createUserAction,
    listUserGroups,
    getUserAction,
    unlockUser,
    getUserPrivateKey,
    getAllMyAccounts,
    getUserProjectFavorites,
    removeMyDuplicateAccounts,
    updateUserProjectFavorites
  };
};
