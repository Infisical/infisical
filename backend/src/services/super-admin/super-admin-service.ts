import * as x509 from "@peculiar/x509";
import bcrypt from "bcrypt";
import crypto, { KeyObject } from "crypto";

import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { TGatewayInstanceConfigDALFactory } from "@app/ee/services/gateway/gateway-instance-config-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { AuthMethod } from "../auth/auth-type";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "../certificate/certificate-types";
import { createSerialNumber, keyAlgorithmToAlgCfg } from "../certificate-authority/certificate-authority-fns";
import { KMS_ROOT_CONFIG_UUID } from "../kms/kms-fns";
import { TKmsRootConfigDALFactory } from "../kms/kms-root-config-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { RootKeyEncryptionStrategy } from "../kms/kms-types";
import { TOrgServiceFactory } from "../org/org-service";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { UserAliasType } from "../user-alias/user-alias-types";
import { TSuperAdminDALFactory } from "./super-admin-dal";
import { LoginMethod, TAdminGetUsersDTO, TAdminSignUpDTO } from "./super-admin-types";

type TSuperAdminServiceFactoryDep = {
  serverCfgDAL: TSuperAdminDALFactory;
  userDAL: TUserDALFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne">;
  authService: Pick<TAuthLoginFactory, "generateUserTokens">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithRootKey" | "decryptWithRootKey" | "updateEncryptionStrategy">;
  kmsRootConfigDAL: TKmsRootConfigDALFactory;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures">;
  gatewayInstanceConfigDAL: Pick<TGatewayInstanceConfigDALFactory, "create" | "findById" | "updateById">;
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
const GATEWAY_INSTANCE_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export const superAdminServiceFactory = ({
  serverCfgDAL,
  userDAL,
  userAliasDAL,
  authService,
  orgService,
  keyStore,
  kmsRootConfigDAL,
  kmsService,
  licenseService,
  gatewayInstanceConfigDAL
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

  const setupInstanceGateway = async () => {
    if (!licenseService.onPremFeatures.gateway) {
      throw new BadRequestError({
        message: "Failed to setup gateway ca due to plan restriction. Upgrade to Infisical's Enterprise plan."
      });
    }

    const existingConfig = await gatewayInstanceConfigDAL.findById(GATEWAY_INSTANCE_CONFIG_UUID);
    if (existingConfig) {
      throw new BadRequestError({
        message: "Gateway has already been configured for the instance"
      });
    }

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    // generate root CA
    const infisicalClientRootCaSerialNumber = createSerialNumber();
    const infisicalClientRootCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const infisicalClientCaSkObj = KeyObject.from(infisicalClientRootCaKeys.privateKey);
    const infisicalClientCaIssuedAt = new Date();
    const infisicalClientCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 25));

    const infisicalClientCaCert = await x509.X509CertificateGenerator.createSelfSigned({
      name: "CN=Infisical Gateway Client Root CA",
      serialNumber: infisicalClientRootCaSerialNumber,
      notBefore: infisicalClientCaIssuedAt,
      notAfter: infisicalClientCaExpiration,
      signingAlgorithm: alg,
      keys: infisicalClientRootCaKeys,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        await x509.SubjectKeyIdentifierExtension.create(infisicalClientRootCaKeys.publicKey)
      ]
    });

    const infisicalClientLeafCertserialNumber = createSerialNumber();
    const infisicalClientLeafKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(infisicalClientCaCert, false),
      await x509.SubjectKeyIdentifierExtension.create(infisicalClientLeafKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] |
          x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT] |
          x509.KeyUsageFlags[CertKeyUsage.KEY_AGREEMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.CLIENT_AUTH]], true)
    ];

    const infisicalClientLeafCert = await x509.X509CertificateGenerator.create({
      serialNumber: infisicalClientLeafCertserialNumber,
      subject: `OU=infisical,CN=infisical`,
      issuer: infisicalClientCaCert.issuer,
      notBefore: infisicalClientCaIssuedAt,
      notAfter: infisicalClientCaExpiration,
      signingKey: infisicalClientRootCaKeys.privateKey,
      publicKey: infisicalClientLeafKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const infisicalClientLeafCertSkObj = KeyObject.from(infisicalClientLeafKeys.privateKey);
    const encryptWithRootKey = kmsService.encryptWithRootKey();
    await gatewayInstanceConfigDAL.create({
      // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
      id: GATEWAY_INSTANCE_CONFIG_UUID,
      isDisabled: false,
      caKeyAlgorithm: CertKeyAlgorithm.RSA_2048,
      infisicalClientCaIssuedAt,
      infisicalClientCaExpiration,
      infisicalClientCaSerialNumber: infisicalClientRootCaSerialNumber,
      encryptedInfisicalClientCaCertificate: encryptWithRootKey(Buffer.from(infisicalClientCaCert.rawData)),
      encryptedInfisicalClientCaPrivateKey: encryptWithRootKey(
        infisicalClientCaSkObj.export({
          type: "pkcs8",
          format: "der"
        })
      ),
      infisicalClientCertIssuedAt: infisicalClientCaIssuedAt,
      infisicalClientCertExpiration: infisicalClientCaExpiration,
      infisicalClientCertSerialNumber: infisicalClientLeafCertserialNumber,
      infisicalClientCertKeyAlgorithm: CertKeyAlgorithm.RSA_2048,
      encryptedInfisicalClientCertificate: encryptWithRootKey(Buffer.from(infisicalClientLeafCert.rawData)),
      encryptedInfisicalClientPrivateKey: encryptWithRootKey(
        infisicalClientLeafCertSkObj.export({
          type: "pkcs8",
          format: "der"
        })
      )
    });
  };

  const updateInstanceGateway = async ({ isDisabled }: { isDisabled?: boolean }) => {
    if (!licenseService.onPremFeatures.gateway) {
      throw new BadRequestError({
        message: "Failed to update gateway ca due to plan restriction. Upgrade to Infisical's Enterprise plan."
      });
    }

    const existingConfig = await gatewayInstanceConfigDAL.findById(GATEWAY_INSTANCE_CONFIG_UUID);
    if (!existingConfig) {
      throw new NotFoundError({
        message: "Gateway instance config not found"
      });
    }

    const updatedGatewayInstanceConfig = await gatewayInstanceConfigDAL.updateById(GATEWAY_INSTANCE_CONFIG_UUID, {
      isDisabled
    });
    return {
      infisicalClientCaSerialNumber: updatedGatewayInstanceConfig.infisicalClientCaSerialNumber,
      isDisabled: updatedGatewayInstanceConfig?.isDisabled,
      caKeyAlgorithm: CertKeyAlgorithm.RSA_2048,
      infisicalClientCaIssuedAt: updatedGatewayInstanceConfig.infisicalClientCaIssuedAt
    };
  };

  const getInstanceGateway = async () => {
    if (!licenseService.onPremFeatures.gateway) {
      throw new BadRequestError({
        message: "Failed to update gateway ca due to plan restriction. Upgrade to Infisical's Enterprise plan."
      });
    }

    const existingConfig = await gatewayInstanceConfigDAL.findById(GATEWAY_INSTANCE_CONFIG_UUID);
    if (!existingConfig) {
      throw new NotFoundError({
        message: "Gateway instance config not found"
      });
    }

    return {
      infisicalClientCaSerialNumber: existingConfig.infisicalClientCaSerialNumber,
      isDisabled: existingConfig?.isDisabled,
      caKeyAlgorithm: CertKeyAlgorithm.RSA_2048,
      infisicalClientCaIssuedAt: existingConfig.infisicalClientCaIssuedAt
    };
  };

  return {
    initServerCfg,
    updateServerCfg,
    adminSignUp,
    getUsers,
    deleteUser,
    getAdminSlackConfig,
    updateRootEncryptionStrategy,
    getConfiguredEncryptionStrategies,
    setupInstanceGateway,
    updateInstanceGateway,
    getInstanceGateway
  };
};
