import { BadRequestError } from "@app/lib/errors";

import { AuthMethod } from "../auth/auth-type";
import { TUserDalFactory } from "./user-dal";

type TUserServiceFactoryDep = {
  userDal: TUserDalFactory;
};

export type TUserServiceFactory = ReturnType<typeof userServiceFactory>;

export const userServiceFactory = ({ userDal }: TUserServiceFactoryDep) => {
  const toggleUserMfa = async (userId: string, isMfaEnabled: boolean) => {
    const updatedUser = await userDal.updateById(userId, {
      isMfaEnabled,
      mfaMethods: isMfaEnabled ? ["email"] : []
    });
    return updatedUser;
  };

  const updateUserName = async (userId: string, firstName: string, lastName: string) => {
    const updatedUser = await userDal.updateById(userId, {
      firstName,
      lastName
    });
    return updatedUser;
  };

  const updateAuthMethods = async (userId: string, authMethods: AuthMethod[]) => {
    const user = await userDal.findById(userId);
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

    const updatedUser = await userDal.updateById(userId, { authMethods });
    return updatedUser;
  };

  const getMe = async (userId: string) => {
    const user = await userDal.findUserEncKeyByUserId(userId);
    if (!user) throw new BadRequestError({ message: "user not found", name: "Get Me" });
    return user;
  };

  const deleteMe = async (userId: string) => {
    const user = await userDal.deleteById(userId);
    return user;
  };

  // user actions operations
  const createUserAction = async (userId: string, action: string) => {
    const userAction = await userDal.transaction(async (tx) => {
      const existingAction = await userDal.findOneUserAction({ action, userId }, tx);
      if (existingAction) return existingAction;
      return userDal.createUserAction({ action, userId }, tx);
    });

    return userAction;
  };

  const getUserAction = async (userId: string, action: string) => {
    const userAction = await userDal.findOneUserAction({ action, userId });
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
