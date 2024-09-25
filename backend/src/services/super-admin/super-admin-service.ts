import bcrypt from "bcrypt";

import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { AuthMethod } from "../auth/auth-type";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TOrgServiceFactory } from "../org/org-service";
import { TUserDALFactory } from "../user/user-dal";
import { TSuperAdminDALFactory } from "./super-admin-dal";
import { LoginMethod, TAdminGetUsersDTO, TAdminSignUpDTO } from "./super-admin-types";

type TSuperAdminServiceFactoryDep = {
  serverCfgDAL: TSuperAdminDALFactory;
  userDAL: TUserDALFactory;
  authService: Pick<TAuthLoginFactory, "generateUserTokens">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithRootKey" | "decryptWithRootKey">;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures">;
};

export type TSuperAdminServiceFactory = ReturnType<typeof superAdminServiceFactory>;

// eslint-disable-next-line
export let getServerCfg: () => Promise<TSuperAdmin & { defaultAuthOrgSlug: string | null }>;

const ADMIN_CONFIG_KEY = "infisical-admin-cfg";
const ADMIN_CONFIG_KEY_EXP = 60; // 60s
const ADMIN_CONFIG_DB_UUID = "00000000-0000-0000-0000-000000000000";

export const superAdminServiceFactory = ({
  serverCfgDAL,
  userDAL,
  authService,
  orgService,
  keyStore,
  kmsService,
  licenseService
}: TSuperAdminServiceFactoryDep) => {
  const initServerCfg = async () => {
    // TODO(akhilmhdh): bad  pattern time less change this later to me itself
    getServerCfg = async () => {
      const config = await keyStore.getItem(ADMIN_CONFIG_KEY);

      // missing in keystore means fetch from db
      if (!config) {
        const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);

        if (!serverCfg) {
          throw new NotFoundError({ message: "Admin config not found" });
        }

        await keyStore.setItemWithExpiry(ADMIN_CONFIG_KEY, ADMIN_CONFIG_KEY_EXP, JSON.stringify(serverCfg)); // insert it back to keystore
        return serverCfg;
      }

      const keyStoreServerCfg = JSON.parse(config) as TSuperAdmin & { defaultAuthOrgSlug: string | null };
      return {
        ...keyStoreServerCfg,
        // this is to allow admin router to work
        createdAt: new Date(keyStoreServerCfg.createdAt),
        updatedAt: new Date(keyStoreServerCfg.updatedAt)
      };
    };

    // reset on initialized
    await keyStore.deleteItem(ADMIN_CONFIG_KEY);
    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (serverCfg) return;

    const newCfg = await serverCfgDAL.create({
      // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
      id: ADMIN_CONFIG_DB_UUID,
      initialized: false,
      allowSignUp: true,
      defaultAuthOrgId: null
    });
    return newCfg;
  };

  const updateServerCfg = async (
    data: TSuperAdminUpdate & { slackClientId?: string; slackClientSecret?: string },
    userId: string
  ) => {
    const updatedData = data;

    if (data.enabledLoginMethods) {
      const superAdminUser = await userDAL.findById(userId);
      const loginMethodToAuthMethod = {
        [LoginMethod.EMAIL]: [AuthMethod.EMAIL],
        [LoginMethod.GOOGLE]: [AuthMethod.GOOGLE],
        [LoginMethod.GITLAB]: [AuthMethod.GITLAB],
        [LoginMethod.GITHUB]: [AuthMethod.GITHUB],
        [LoginMethod.LDAP]: [AuthMethod.LDAP],
        [LoginMethod.OIDC]: [AuthMethod.OIDC],
        [LoginMethod.SAML]: [
          AuthMethod.AZURE_SAML,
          AuthMethod.GOOGLE_SAML,
          AuthMethod.JUMPCLOUD_SAML,
          AuthMethod.KEYCLOAK_SAML,
          AuthMethod.OKTA_SAML
        ]
      };

      if (
        !data.enabledLoginMethods.some((loginMethod) =>
          loginMethodToAuthMethod[loginMethod as LoginMethod].some(
            (authMethod) => superAdminUser.authMethods?.includes(authMethod)
          )
        )
      ) {
        throw new BadRequestError({
          message: "You must configure at least one auth method to prevent account lockout"
        });
      }
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();
    if (data.slackClientId) {
      const encryptedClientId = encryptWithRoot(Buffer.from(data.slackClientId));

      updatedData.encryptedSlackClientId = encryptedClientId;
      updatedData.slackClientId = undefined;
    }

    if (data.slackClientSecret) {
      const encryptedClientSecret = encryptWithRoot(Buffer.from(data.slackClientSecret));

      updatedData.encryptedSlackClientSecret = encryptedClientSecret;
      updatedData.slackClientSecret = undefined;
    }

    const updatedServerCfg = await serverCfgDAL.updateById(ADMIN_CONFIG_DB_UUID, updatedData);

    await keyStore.setItemWithExpiry(ADMIN_CONFIG_KEY, ADMIN_CONFIG_KEY_EXP, JSON.stringify(updatedServerCfg));

    return updatedServerCfg;
  };

  const adminSignUp = async ({
    lastName,
    firstName,
    salt,
    email,
    password,
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
    if (existingUser) throw new BadRequestError({ name: "Admin sign up", message: "User already exists" });

    const privateKey = await getUserPrivateKey(password, {
      encryptionVersion: 2,
      salt,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      encryptedPrivateKey,
      iv: encryptedPrivateKeyIV,
      tag: encryptedPrivateKeyTag
    });
    const hashedPassword = await bcrypt.hash(password, appCfg.BCRYPT_SALT_ROUND);
    const { iv, tag, ciphertext, encoding } = infisicalSymmetricEncypt(privateKey);
    const userInfo = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.create(
        {
          firstName,
          lastName,
          username: email,
          email,
          superAdmin: true,
          isGhost: false,
          isAccepted: true,
          authMethods: [AuthMethod.EMAIL],
          isEmailVerified: true
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
          userId: newUser.id,
          hashedPassword,
          serverEncryptedPrivateKey: ciphertext,
          serverEncryptedPrivateKeyIV: iv,
          serverEncryptedPrivateKeyTag: tag,
          serverEncryptedPrivateKeyEncoding: encoding
        },
        tx
      );
      return { user: newUser, enc: userEnc };
    });

    const initialOrganizationName = appCfg.INITIAL_ORGANIZATION_NAME ?? "Admin Org";

    const organization = await orgService.createOrganization({
      userId: userInfo.user.id,
      userEmail: userInfo.user.email,
      orgName: initialOrganizationName
    });

    await updateServerCfg({ initialized: true }, userInfo.user.id);
    const token = await authService.generateUserTokens({
      user: userInfo.user,
      authMethod: AuthMethod.EMAIL,
      ip,
      userAgent,
      organizationId: undefined
    });
    // TODO(akhilmhdh-pg): telemetry service
    return { token, user: userInfo, organization };
  };

  const getUsers = ({ offset, limit, searchTerm }: TAdminGetUsersDTO) => {
    return userDAL.getUsersByFilter({
      limit,
      offset,
      searchTerm,
      sortBy: "username"
    });
  };

  const deleteUser = async (userId: string) => {
    if (!licenseService.onPremFeatures?.instanceUserManagement) {
      throw new BadRequestError({
        message: "Failed to delete user due to plan restriction. Upgrade to Infisical's Pro plan."
      });
    }

    const user = await userDAL.deleteById(userId);
    return user;
  };

  const getAdminSlackConfig = async () => {
    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);

    if (!serverCfg) {
      throw new NotFoundError({ name: "Admin config", message: "Admin config not found" });
    }

    let clientId = "";
    let clientSecret = "";

    const decrypt = kmsService.decryptWithRootKey();

    if (serverCfg.encryptedSlackClientId) {
      clientId = decrypt(serverCfg.encryptedSlackClientId).toString();
    }

    if (serverCfg.encryptedSlackClientSecret) {
      clientSecret = decrypt(serverCfg.encryptedSlackClientSecret).toString();
    }

    return {
      clientId,
      clientSecret
    };
  };

  return {
    initServerCfg,
    updateServerCfg,
    adminSignUp,
    getUsers,
    deleteUser,
    getAdminSlackConfig
  };
};
