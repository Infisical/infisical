import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { TUserDalFactory } from "../user/user-dal";
import { TSuperAdminDalFactory } from "./super-admin-dal";
import { TAdminSignUpDTO } from "./super-admin-types";

type TSuperAdminServiceFactoryDep = {
  serverCfgDal: TSuperAdminDalFactory;
  userDal: TUserDalFactory;
  authService: Pick<TAuthLoginFactory, "generateUserTokens">;
};

export type TSuperAdminServiceFactory = ReturnType<typeof superAdminServiceFactory>;

export const superAdminServiceFactory = ({
  serverCfgDal,
  userDal,
  authService
}: TSuperAdminServiceFactoryDep) => {
  let serverCfg: TSuperAdmin;

  const initServerCfg = async () => {
    serverCfg = await serverCfgDal.findOne({});
    if (!serverCfg) {
      const newCfg = await serverCfgDal.create({ initialized: false, allowSignUp: true });
      serverCfg = newCfg;
      return newCfg;
    }
    return serverCfg;
  };

  const getServerCfg = () => {
    if (!serverCfg)
      throw new BadRequestError({ name: "Get server cfg", message: "Server cfg not initialized" });
    return serverCfg;
  };

  const updateServerCfg = async (data: TSuperAdminUpdate) => {
    const cfg = await serverCfgDal.updateById(serverCfg.id, data);
    serverCfg = cfg;
    return cfg;
  };

  const adminSignUp = async ({
    lastName,
    firstName,
    salt,
    email,
    verifier,
    publicKey,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    ip,
    userAgent
  }: TAdminSignUpDTO) => {
    const existingUser = await userDal.findOne({ email });
    if (existingUser)
      throw new BadRequestError({ name: "Admin sign up", message: "User already exist" });

    const userInfo = await userDal.transaction(async (tx) => {
      const newUser = await userDal.create(
        {
          firstName,
          lastName,
          email,
          superAdmin: true,
          isAccepted: true
        },
        tx
      );
      const userEnc = await userDal.createUserEncryption(
        {
          salt,
          encryptionVersion: 2,
          protectedKey,
          protectedKeyIV,
          protectedKeyTag,
          publicKey,
          encryptedPrivateKey,
          iv: encryptedPrivateKeyIV,
          tag: encryptedPrivateKeyTag,
          verifier,
          userId: newUser.id
        },
        tx
      );
      return { user: newUser, enc: userEnc };
    });

    await updateServerCfg({ initialized: true });
    const token = await authService.generateUserTokens(userInfo.user, ip, userAgent);
    // TODO(akhilmhdh-pg): telemetry service
    return { token, user: userInfo };
  };

  return {
    initServerCfg,
    getServerCfg,
    updateServerCfg,
    adminSignUp
  };
};
