import { BadRequestError } from "@app/lib/errors";

import { AuthMethod } from "../auth/auth-type";
import { TUserDALFactory } from "./user-dal";

type TUserServiceFactoryDep = {
  userDAL: TUserDALFactory;
};

export type TUserServiceFactory = ReturnType<typeof userServiceFactory>;

export const userServiceFactory = ({ userDAL }: TUserServiceFactoryDep) => {
  const toggleUserMfa = async (userId: string, isMfaEnabled: boolean) => {
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

    const hasSamlEnabled = user?.authMethods?.some((method) =>
      [AuthMethod.OKTA_SAML, AuthMethod.AZURE_SAML, AuthMethod.JUMPCLOUD_SAML].includes(
        method as AuthMethod
      )
    );
    if (hasSamlEnabled)
      throw new BadRequestError({
        name: "Update auth method",
        message: "Failed to update auth methods due to SAML SSO "
      });

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
    toggleUserMfa,
    updateUserName,
    updateAuthMethods,
    deleteMe,
    getMe,
    createUserAction,
    getUserAction
  };
};
