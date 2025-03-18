import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod, OrgMembershipRole, TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { generateUserSrpKeys, getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { AuthMethod, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TIdentityTokenAuthDALFactory } from "../identity-token-auth/identity-token-auth-dal";
import { KMS_ROOT_CONFIG_UUID } from "../kms/kms-fns";
import { TKmsRootConfigDALFactory } from "../kms/kms-root-config-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { RootKeyEncryptionStrategy } from "../kms/kms-types";
import { TOrgServiceFactory } from "../org/org-service";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { UserAliasType } from "../user-alias/user-alias-types";
import { TSuperAdminDALFactory } from "./super-admin-dal";
import {
  LoginMethod,
  TAdminBootstrapInstanceDTO,
  TAdminGetIdentitiesDTO,
  TAdminGetUsersDTO,
  TAdminSignUpDTO
} from "./super-admin-types";

type TSuperAdminServiceFactoryDep = {
  identityDAL: TIdentityDALFactory;
  identityTokenAuthDAL: TIdentityTokenAuthDALFactory;
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  serverCfgDAL: TSuperAdminDALFactory;
  userDAL: TUserDALFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne">;
  authService: Pick<TAuthLoginFactory, "generateUserTokens">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithRootKey" | "decryptWithRootKey" | "updateEncryptionStrategy">;
  kmsRootConfigDAL: TKmsRootConfigDALFactory;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures">;
};

export type TSuperAdminServiceFactory = ReturnType<typeof superAdminServiceFactory>;

// eslint-disable-next-line
export let getServerCfg: () => Promise<
  TSuperAdmin & {
    defaultAuthOrgSlug: string | null;
    defaultAuthOrgAuthEnforced?: boolean | null;
    defaultAuthOrgAuthMethod?: string | null;
  }
>;

const ADMIN_CONFIG_KEY = "infisical-admin-cfg";
const ADMIN_CONFIG_KEY_EXP = 60; // 60s
const ADMIN_CONFIG_DB_UUID = "00000000-0000-0000-0000-000000000000";

export const superAdminServiceFactory = ({
  serverCfgDAL,
  userDAL,
  identityDAL,
  userAliasDAL,
  authService,
  orgService,
  keyStore,
  kmsRootConfigDAL,
  kmsService,
  licenseService,
  identityAccessTokenDAL,
  identityTokenAuthDAL,
  identityOrgMembershipDAL
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
    const serverCfg = await serverCfgDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SuperAdminInit]);
      const serverCfgInDB = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
      if (serverCfgInDB) return serverCfgInDB;

      const newCfg = await serverCfgDAL.create({
        // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
        id: ADMIN_CONFIG_DB_UUID,
        initialized: false,
        allowSignUp: true,
        defaultAuthOrgId: null
      });
      return newCfg;
    });
    return serverCfg;
  };

  const updateServerCfg = async (
    data: TSuperAdminUpdate & { slackClientId?: string; slackClientSecret?: string },
    userId: string
  ) => {
    const updatedData = data;

    if (data.enabledLoginMethods) {
      const superAdminUser = await userDAL.findById(userId);
      const isSamlConfiguredForUser = Boolean(
        await userAliasDAL.findOne({
          userId,
          aliasType: UserAliasType.SAML
        })
      );

      // We do not store SAML and OIDC auth values in the user authMethods field
      // and so we infer its usage from the user's aliases
      const isUserSamlAccessEnabled = isSamlConfiguredForUser && data.enabledLoginMethods.includes(LoginMethod.SAML);
      const isOidcConfiguredForUser = Boolean(
        await userAliasDAL.findOne({
          userId,
          aliasType: UserAliasType.OIDC
        })
      );

      const isUserOidcAccessEnabled = isOidcConfiguredForUser && data.enabledLoginMethods.includes(LoginMethod.OIDC);

      const loginMethodToAuthMethod = {
        [LoginMethod.EMAIL]: [AuthMethod.EMAIL],
        [LoginMethod.GOOGLE]: [AuthMethod.GOOGLE],
        [LoginMethod.GITLAB]: [AuthMethod.GITLAB],
        [LoginMethod.GITHUB]: [AuthMethod.GITHUB],
        [LoginMethod.LDAP]: [AuthMethod.LDAP],
        [LoginMethod.SAML]: [],
        [LoginMethod.OIDC]: []
      };

      const canServerAdminAccessAfterApply =
        data.enabledLoginMethods.some((loginMethod) =>
          loginMethodToAuthMethod[loginMethod as LoginMethod].some(
            (authMethod) => superAdminUser.authMethods?.includes(authMethod)
          )
        ) ||
        isUserSamlAccessEnabled ||
        isUserOidcAccessEnabled;

      if (!canServerAdminAccessAfterApply) {
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

  const bootstrapInstance = async ({ email, password, organizationName }: TAdminBootstrapInstanceDTO) => {
    const appCfg = getConfig();
    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (serverCfg?.initialized) {
      throw new BadRequestError({ message: "Instance has already been set up" });
    }

    const existingUser = await userDAL.findOne({ email });
    if (existingUser) throw new BadRequestError({ name: "Instance initialization", message: "User already exists" });

    const userInfo = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.create(
        {
          firstName: "Admin",
          lastName: "User",
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
      const { tag, encoding, ciphertext, iv } = infisicalSymmetricEncypt(password);
      const encKeys = await generateUserSrpKeys(email, password);

      const userEnc = await userDAL.createUserEncryption(
        {
          userId: newUser.id,
          encryptionVersion: 2,
          protectedKey: encKeys.protectedKey,
          protectedKeyIV: encKeys.protectedKeyIV,
          protectedKeyTag: encKeys.protectedKeyTag,
          publicKey: encKeys.publicKey,
          encryptedPrivateKey: encKeys.encryptedPrivateKey,
          iv: encKeys.encryptedPrivateKeyIV,
          tag: encKeys.encryptedPrivateKeyTag,
          salt: encKeys.salt,
          verifier: encKeys.verifier,
          serverEncryptedPrivateKeyEncoding: encoding,
          serverEncryptedPrivateKeyTag: tag,
          serverEncryptedPrivateKeyIV: iv,
          serverEncryptedPrivateKey: ciphertext
        },
        tx
      );

      return { user: newUser, enc: userEnc };
    });

    const initialOrganizationName = organizationName ?? "Admin Org";

    const organization = await orgService.createOrganization({
      userId: userInfo.user.id,
      userEmail: userInfo.user.email,
      orgName: initialOrganizationName
    });

    const { identity, credentials } = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create({ name: "Instance Admin Identity" }, tx);
      await identityOrgMembershipDAL.create(
        {
          identityId: newIdentity.id,
          orgId: organization.id,
          role: OrgMembershipRole.Admin
        },
        tx
      );

      const tokenAuth = await identityTokenAuthDAL.create(
        {
          identityId: newIdentity.id,
          accessTokenMaxTTL: 0,
          accessTokenTTL: 0,
          accessTokenNumUsesLimit: 0,
          accessTokenTrustedIps: JSON.stringify([
            {
              type: "ipv4",
              prefix: 0,
              ipAddress: "0.0.0.0"
            },
            {
              type: "ipv6",
              prefix: 0,
              ipAddress: "::"
            }
          ])
        },
        tx
      );

      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: newIdentity.id,
          isAccessTokenRevoked: false,
          accessTokenTTL: tokenAuth.accessTokenTTL,
          accessTokenMaxTTL: tokenAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: tokenAuth.accessTokenNumUsesLimit,
          name: "Instance Admin Token",
          authMethod: IdentityAuthMethod.TOKEN_AUTH
        },
        tx
      );

      const generatedAccessToken = jwt.sign(
        {
          identityId: newIdentity.id,
          identityAccessTokenId: newToken.id,
          authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
        } as TIdentityAccessTokenJwtPayload,
        appCfg.AUTH_SECRET
      );

      return { identity: newIdentity, auth: tokenAuth, credentials: { token: generatedAccessToken } };
    });

    await updateServerCfg({ initialized: true, adminIdentityIds: [identity.id] }, userInfo.user.id);

    return {
      user: userInfo,
      organization,
      machineIdentity: {
        ...identity,
        credentials
      }
    };
  };

  const getUsers = ({ offset, limit, searchTerm, adminsOnly }: TAdminGetUsersDTO) => {
    return userDAL.getUsersByFilter({
      limit,
      offset,
      searchTerm,
      sortBy: "username",
      adminsOnly
    });
  };

  const deleteUser = async (userId: string) => {
    const user = await userDAL.deleteById(userId);
    return user;
  };

  const deleteIdentitySuperAdminAccess = async (identityId: string, actorId: string) => {
    const identity = await identityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ name: "Identity", message: "Identity not found" });
    }

    const currentAdminIdentityIds = (await getServerCfg()).adminIdentityIds ?? [];
    if (!currentAdminIdentityIds?.includes(identityId)) {
      throw new BadRequestError({ name: "Identity", message: "Identity does not have super admin access" });
    }

    await updateServerCfg({ adminIdentityIds: currentAdminIdentityIds.filter((id) => id !== identityId) }, actorId);

    return identity;
  };

  const deleteUserSuperAdminAccess = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user) {
      throw new NotFoundError({ name: "User", message: "User not found" });
    }

    const updatedUser = userDAL.updateById(userId, { superAdmin: false });

    return updatedUser;
  };

  const getIdentities = async ({ offset, limit, searchTerm }: TAdminGetIdentitiesDTO) => {
    const identities = await identityDAL.getIdentitiesByFilter({
      limit,
      offset,
      searchTerm,
      sortBy: "name"
    });
    const serverCfg = await getServerCfg();

    return identities.map((identity) => ({
      ...identity,
      isInstanceAdmin: Boolean(serverCfg?.adminIdentityIds?.includes(identity.id))
    }));
  };

  const grantServerAdminAccessToUser = async (userId: string) => {
    if (!licenseService.onPremFeatures?.instanceUserManagement) {
      throw new BadRequestError({
        message: "Failed to grant server admin access to user due to plan restriction. Upgrade to Infisical's Pro plan."
      });
    }
    await userDAL.updateById(userId, { superAdmin: true });
  };

  const getAdminSlackConfig = async () => {
    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);

    if (!serverCfg) {
      throw new NotFoundError({ name: "AdminConfig", message: "Admin config not found" });
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

  const getConfiguredEncryptionStrategies = async () => {
    const appCfg = getConfig();

    const kmsRootCfg = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);

    if (!kmsRootCfg) {
      throw new NotFoundError({ name: "KmsRootConfig", message: "KMS root configuration not found" });
    }

    const selectedStrategy = kmsRootCfg.encryptionStrategy;
    const enabledStrategies: { enabled: boolean; strategy: RootKeyEncryptionStrategy }[] = [];

    if (appCfg.ROOT_ENCRYPTION_KEY || appCfg.ENCRYPTION_KEY) {
      const basicStrategy = RootKeyEncryptionStrategy.Software;

      enabledStrategies.push({
        enabled: selectedStrategy === basicStrategy,
        strategy: basicStrategy
      });
    }
    if (appCfg.isHsmConfigured) {
      const hsmStrategy = RootKeyEncryptionStrategy.HSM;

      enabledStrategies.push({
        enabled: selectedStrategy === hsmStrategy,
        strategy: hsmStrategy
      });
    }

    return {
      strategies: enabledStrategies
    };
  };

  const updateRootEncryptionStrategy = async (strategy: RootKeyEncryptionStrategy) => {
    if (!licenseService.onPremFeatures.hsm) {
      throw new BadRequestError({
        message: "Failed to update encryption strategy due to plan restriction. Upgrade to Infisical's Enterprise plan."
      });
    }

    const configuredStrategies = await getConfiguredEncryptionStrategies();

    const foundStrategy = configuredStrategies.strategies.find((s) => s.strategy === strategy);

    if (!foundStrategy) {
      throw new BadRequestError({ message: "Invalid encryption strategy" });
    }

    if (foundStrategy.enabled) {
      throw new BadRequestError({ message: "The selected encryption strategy is already enabled" });
    }

    await kmsService.updateEncryptionStrategy(strategy);
  };

  return {
    initServerCfg,
    updateServerCfg,
    adminSignUp,
    bootstrapInstance,
    getUsers,
    deleteUser,
    getIdentities,
    getAdminSlackConfig,
    updateRootEncryptionStrategy,
    getConfiguredEncryptionStrategies,
    grantServerAdminAccessToUser,
    deleteIdentitySuperAdminAccess,
    deleteUserSuperAdminAccess
  };
};
