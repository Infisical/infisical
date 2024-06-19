import { SecretKeyEncoding } from "@app/db/schemas";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { AuthMethod } from "../auth/auth-type";
import { TUserDALFactory } from "./user-dal";

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
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "find" | "insertMany">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TUserServiceFactory = ReturnType<typeof userServiceFactory>;

export const userServiceFactory = ({
  userDAL,
  userAliasDAL,
  orgMembershipDAL,
  tokenService,
  smtpService
}: TUserServiceFactoryDep) => {
  const sendEmailVerificationCode = async (username: string) => {
    const user = await userDAL.findOne({ username });
    if (!user) throw new BadRequestError({ name: "Failed to find user" });
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
    if (!user) throw new BadRequestError({ name: "Failed to find user" });
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
        if (!mergeUser) throw new BadRequestError({ name: "Failed to find merge user" });

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
    if (!user) throw new BadRequestError({ name: "Update auth methods" });

    if (user.authMethods?.includes(AuthMethod.LDAP))
      throw new BadRequestError({ message: "LDAP auth method cannot be updated", name: "Update auth methods" });

    if (authMethods.includes(AuthMethod.LDAP))
      throw new BadRequestError({ message: "LDAP auth method cannot be updated", name: "Update auth methods" });

    const updatedUser = await userDAL.updateById(userId, { authMethods });
    return updatedUser;
  };

  const getMe = async (userId: string) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user) throw new BadRequestError({ message: "user not found", name: "Get Me" });
    return user;
  };

  const deleteMe = async (userId: string) => {
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
      throw new BadRequestError({ message: "Private key not found. Please login again" });
    }
    const privateKey = infisicalSymmetricDecrypt({
      ciphertext: user.serverEncryptedPrivateKey,
      tag: user.serverEncryptedPrivateKeyTag,
      iv: user.serverEncryptedPrivateKeyIV,
      keyEncoding: user.serverEncryptedPrivateKeyEncoding as SecretKeyEncoding
    });

    return privateKey;
  };

  return {
    sendEmailVerificationCode,
    verifyEmailVerificationCode,
    toggleUserMfa,
    updateUserName,
    updateAuthMethods,
    deleteMe,
    getMe,
    createUserAction,
    getUserAction,
    unlockUser,
    getUserPrivateKey
  };
};
