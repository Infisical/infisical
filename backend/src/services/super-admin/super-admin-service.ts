import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
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

// eslint-disable-next-line
export let getServerCfg: () => Promise<TSuperAdmin>;

export const superAdminServiceFactory = ({
  serverCfgDAL,
  userDAL,
  authService,
  orgService
}: TSuperAdminServiceFactoryDep) => {
  const initServerCfg = async () => {
    // TODO(akhilmhdh): bad  pattern time less change this later to me itself
    getServerCfg = () => serverCfgDAL.findOne({});

    const serverCfg = await serverCfgDAL.findOne({});
    if (serverCfg) return;
    const newCfg = await serverCfgDAL.create({ initialized: false, allowSignUp: true });
    return newCfg;
  };

  const updateServerCfg = async (data: TSuperAdminUpdate) => {
    const serverCfg = await getServerCfg();
    const cfg = await serverCfgDAL.updateById(serverCfg.id, data);
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
    const appCfg = getConfig();
    const existingUser = await userDAL.findOne({ email });
    if (existingUser) throw new BadRequestError({ name: "Admin sign up", message: "User already exist" });

    const userInfo = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.create(
        {
          firstName,
          lastName,
          email,
          superAdmin: true,
          isGhost: false,
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

    const initialOrganizationName = appCfg.INITIAL_ORGANIZATION_NAME ?? "Admin Org";

    const organization = await orgService.createOrganization(
      userInfo.user.id,
      userInfo.user.email,
      initialOrganizationName
    );

    await updateServerCfg({ initialized: true });
    const token = await authService.generateUserTokens({
      user: userInfo.user,
      ip,
      userAgent,
      organizationId: undefined
    });
    // TODO(akhilmhdh-pg): telemetry service
    return { token, user: userInfo, organization };
  };

  return {
    initServerCfg,
    updateServerCfg,
    adminSignUp
  };
};
