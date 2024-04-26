import { BadRequestError } from "@app/lib/errors";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { AuthMethod } from "../auth/auth-type";
import { TUserDALFactory } from "./user-dal";

// TODO: Pick all of these
type TUserServiceFactoryDep = {
  userDAL: TUserDALFactory;
  userAliasDAL: TUserAliasDALFactory;
  orgDAL: TOrgDALFactory;
  orgMembershipDAL: TOrgMembershipDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TUserServiceFactory = ReturnType<typeof userServiceFactory>;

export const userServiceFactory = ({
  userDAL,
  userAliasDAL,
  // orgDAL,
  orgMembershipDAL,
  tokenService,
  smtpService
}: TUserServiceFactoryDep) => {
  const sendEmailVerificationCode = async (userId: string) => {
    console.log("sendEmailVerificationCode userId: ", userId);
    const user = await userDAL.findById(userId);
    if (!user) throw new BadRequestError({ name: "Failed to find user" });
    if (!user.email)
      throw new BadRequestError({ name: "Failed to send email verification code due to no email on user" });
    if (user.isEmailVerified)
      throw new BadRequestError({ name: "Failed to send email verification code due to email already verified" });

    console.log("sendEmailVerificationCode user: ", user);
    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id
    });

    console.log("sendEmailVerificationCode 2");
    await smtpService.sendMail({
      template: SmtpTemplates.EmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [user.email],
      substitutions: {
        code: token
      }
    });
  };

  const verifyEmailVerificationCode = async (userId: string, code: string) => {
    console.log("verifyEmailVerificationCode args: ", {
      userId,
      code
    });

    const user = await userDAL.findById(userId);
    if (!user) throw new BadRequestError({ name: "Failed to find user" });
    if (user.isEmailVerified)
      throw new BadRequestError({ name: "Failed to verify email verification code due to email already verified" });

    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id,
      code
    });

    await userDAL.updateById(userId, { isEmailVerified: true });
  };

  // lists users with same verified email only
  const listUsersWithSameEmail = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user) throw new BadRequestError({ name: "Failed to find user" });
    if (!user.email)
      throw new BadRequestError({ name: "Failed to list users with same email due to no email on user" });
    if (!user.isEmailVerified)
      throw new BadRequestError({ name: "Failed to list users with same email due to email not verified" });

    const users = await userDAL.find({
      email: user.email,
      isEmailVerified: true
    });

    return users;
  };

  /**
   * Merges two users with the same email. Specifically:
   * - Deletes the current user with id [userId] and transfers any resources to the user with username [username]
   * @param userId
   * @param username
   */
  const mergeUsers = async (userId: string, username: string) => {
    const targetUser = await userDAL.transaction(async (tx) => {
      const myUser = await userDAL.findById(userId, tx);
      if (!myUser || !myUser.isEmailVerified) throw new BadRequestError({});

      const mergeUser = await userDAL.findOne(
        {
          username
        },
        tx
      );
      if (!mergeUser || !mergeUser.isEmailVerified) throw new BadRequestError({});

      if (myUser.email !== mergeUser.email) throw new BadRequestError({});

      const mergeUserOrgMembershipSet = new Set(
        (await orgMembershipDAL.find({ userId: mergeUser.id }, { tx })).map((m) => m.orgId)
      );
      const myOrgMemberships = (await orgMembershipDAL.find({ userId: myUser.id }, { tx })).filter(
        (m) => !mergeUserOrgMembershipSet.has(m.orgId)
      );

      const userAliases = await userAliasDAL.find(
        {
          userId: myUser.id
        },
        { tx }
      );
      await userDAL.deleteById(myUser.id, tx);

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

      return mergeUser;
    });

    return targetUser;
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

  return {
    sendEmailVerificationCode,
    verifyEmailVerificationCode,
    listUsersWithSameEmail,
    mergeUsers,
    toggleUserMfa,
    updateUserName,
    updateAuthMethods,
    deleteMe,
    getMe,
    createUserAction,
    getUserAction
  };
};
