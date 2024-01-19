import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { AuthMethod } from "../auth/auth-type";
import { TOrgServiceFactory } from "../org/org-service";
import { TUserDALFactory } from "../user/user-dal";
import { TSuperAdminDALFactory } from "./super-admin-dal";
import { TAdminSignUpDTO } from "./super-admin-types";

type TSuperAdminServiceFactoryDep = {
  serverCfgDAL: TSuperAdminDALFactory;
  userDAL: TUserDALFactory;
  authService: Pick<TAuthLoginFactory, "generateUserTokens">;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
};

export type TSuperAdminServiceFactory = ReturnType<typeof superAdminServiceFactory>;

let serverCfg: Readonly<TSuperAdmin>;
export const getServerCfg = () => {
  if (!serverCfg)
    throw new BadRequestError({ name: "Get server cfg", message: "Server cfg not initialized" });
  return serverCfg;
};

export const superAdminServiceFactory = ({
  serverCfgDAL,
  userDAL,
  authService,
  orgService
}: TSuperAdminServiceFactoryDep) => {
  const initServerCfg = async () => {
    serverCfg = await serverCfgDAL.findOne({});
    if (!serverCfg) {
      const newCfg = await serverCfgDAL.create({ initialized: false, allowSignUp: true });
      serverCfg = newCfg;
      return newCfg;
    }
    return serverCfg;
  };

  const updateServerCfg = async (data: TSuperAdminUpdate) => {
    const cfg = await serverCfgDAL.updateById(serverCfg.id, data);
    serverCfg = Object.freeze(cfg);
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
    const existingUser = await userDAL.findOne({ email });
    if (existingUser)
      throw new BadRequestError({ name: "Admin sign up", message: "User already exist" });

    const userInfo = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.create(
        {
          firstName,
          lastName,
          email,
          superAdmin: true,
          isAccepted: true,
          authMethods: [AuthMethod.EMAIL]
        },
        tx
      );
      const userEnc = await userDAL.createUserEncryption(
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
    await orgService.createOrganization(userInfo.user.id, userInfo.user.email, "Admin Org");

    await updateServerCfg({ initialized: true });
    const token = await authService.generateUserTokens(userInfo.user, ip, userAgent);
    // TODO(akhilmhdh-pg): telemetry service
    return { token, user: userInfo };
  };

  return {
    initServerCfg,
    updateServerCfg,
    adminSignUp
  };
};
