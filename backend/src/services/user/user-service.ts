import { ForbiddenError } from "@casl/ability";

import { SecretKeyEncoding } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { AuthMethod } from "../auth/auth-type";
import { TGroupProjectDALFactory } from "../group-project/group-project-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TUserDALFactory } from "./user-dal";
import { TListUserGroupsDTO } from "./user-types";

type TUserServiceFactoryDep = {
  userDAL: Pick<
    TUserDALFactory,
    | "find"
    | "findOne"
    | "findById"
    | "transaction"
    | "updateById"
    | "update"
    | "deleteById"
    | "findOneUserAction"
    | "createUserAction"
    | "findUserEncKeyByUserId"
    | "delete"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "find" | "insertMany">;
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
  userAliasDAL,
  orgMembershipDAL,
  projectMembershipDAL,
  groupProjectDAL,
  tokenService,
  smtpService,
  permissionService
}: TUserServiceFactoryDep) => {
  const sendEmailVerificationCode = async (username: string) => {
    const user = await userDAL.findOne({ username });
    if (!user) throw new NotFoundError({ name: "Failed to find user" });
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
    const user = await userDAL.findOne({ username });
    if (!user) throw new NotFoundError({ name: "Failed to find user" });
    if (!user.email)
      throw new BadRequestError({ name: "Failed to verify email verification code due to no email on user" });
    if (user.isEmailVerified)
      throw new BadRequestError({ name: "Failed to verify email verification code due to email already verified" });

    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id,
      code
    });

    const { email } = user;

    await userDAL.transaction(async (tx) => {
      await userDAL.updateById(
        user.id,
        {
          isEmailVerified: true
        },
        tx
      );

      // check if there are verified users with the same email.
      const users = await userDAL.find(
        {
          email,
          isEmailVerified: true
        },
        { tx }
      );

      if (users.length > 1) {
        // merge users
        const mergeUser = users.find((u) => u.id !== user.id);
        if (!mergeUser) throw new NotFoundError({ name: "Failed to find merge user" });

        const mergeUserOrgMembershipSet = new Set(
          (await orgMembershipDAL.find({ userId: mergeUser.id }, { tx })).map((m) => m.orgId)
        );
        const myOrgMemberships = (await orgMembershipDAL.find({ userId: user.id }, { tx })).filter(
          (m) => !mergeUserOrgMembershipSet.has(m.orgId)
        );

        const userAliases = await userAliasDAL.find(
          {
            userId: user.id
          },
          { tx }
        );
        await userDAL.deleteById(user.id, tx);

        if (myOrgMemberships.length) {
          await orgMembershipDAL.insertMany(
            myOrgMemberships.map((orgMembership) => ({
              ...orgMembership,
              userId: mergeUser.id
            })),
            tx
          );
        }

        if (userAliases.length) {
          await userAliasDAL.insertMany(
            userAliases.map((userAlias) => ({
              ...userAlias,
              userId: mergeUser.id
            })),
            tx
          );
        }
      } else {
        await userDAL.delete(
          {
            email,
            isAccepted: false,
            isEmailVerified: false
          },
          tx
        );

        // update current user's username to [email]
        await userDAL.updateById(
          user.id,
          {
            username: email
          },
          tx
        );
      }
    });
  };

  const toggleUserMfa = async (userId: string, isMfaEnabled: boolean) => {
    const user = await userDAL.findById(userId);

    if (!user || !user.email) throw new BadRequestError({ name: "Failed to toggle MFA" });

    const updatedUser = await userDAL.updateById(userId, {
      isMfaEnabled,
      mfaMethods: isMfaEnabled ? ["email"] : []
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
    if (!user) throw new NotFoundError({ message: "User not found" });

    if (user.authMethods?.includes(AuthMethod.LDAP) || authMethods.includes(AuthMethod.LDAP)) {
      throw new BadRequestError({ message: "LDAP auth method cannot be updated", name: "Update auth methods" });
    }

    const updatedUser = await userDAL.updateById(userId, { authMethods });
    return updatedUser;
  };

  const getMe = async (userId: string) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user) throw new NotFoundError({ message: "User not found" });
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
      throw new NotFoundError({ message: "Private key not found. Please login again" });
    }
    const privateKey = infisicalSymmetricDecrypt({
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
    const user = await userDAL.findOne({
      username
    });

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
    toggleUserMfa,
    updateUserName,
    updateAuthMethods,
    deleteUser,
    getMe,
    createUserAction,
    listUserGroups,
    getUserAction,
    unlockUser,
    getUserPrivateKey,
    getUserProjectFavorites,
    updateUserProjectFavorites
  };
};
