import * as x509 from "@peculiar/x509";
import bcrypt from "bcrypt";
import crypto, { KeyObject } from "crypto";
import ms from "ms";

import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { TKmipInstanceConfigDALFactory } from "@app/ee/services/kmip/kmip-instance-config-dal";
import { TKmipInstanceServerCertificateDALFactory } from "@app/ee/services/kmip/kmip-instance-server-certificate-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { isValidIp } from "@app/lib/ip";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { AuthMethod } from "../auth/auth-type";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "../certificate/certificate-types";
import { createSerialNumber, keyAlgorithmToAlgCfg } from "../certificate-authority/certificate-authority-fns";
import { hostnameRegex } from "../certificate-authority/certificate-authority-validators";
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
  TAdminGetUsersDTO,
  TAdminSignUpDTO,
  TGenerateInstanceKmipServerCertificateDTO,
  TSetupInstanceKmipDTO
} from "./super-admin-types";

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
  kmipInstanceConfigDAL: TKmipInstanceConfigDALFactory;
  kmipInstanceServerCertificateDAL: TKmipInstanceServerCertificateDALFactory;
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
  userAliasDAL,
  authService,
  orgService,
  keyStore,
  kmsRootConfigDAL,
  kmsService,
  licenseService,
  kmipInstanceConfigDAL,
  kmipInstanceServerCertificateDAL
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

  const setupInstanceKmip = async ({ caKeyAlgorithm }: TSetupInstanceKmipDTO) => {
    const kmipInstanceConfig = await kmipInstanceConfigDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (kmipInstanceConfig) {
      throw new BadRequestError({
        message: "KMIP has already been configured for the instance"
      });
    }

    const alg = keyAlgorithmToAlgCfg(caKeyAlgorithm);

    // generate root CA
    const rootCaSerialNumber = createSerialNumber();
    const rootCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const rootCaSkObj = KeyObject.from(rootCaKeys.privateKey);
    const rootCaIssuedAt = new Date();
    const rootCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 20));

    const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
      name: "CN=KMIP Root CA",
      serialNumber: rootCaSerialNumber,
      notBefore: rootCaIssuedAt,
      notAfter: rootCaExpiration,
      signingAlgorithm: alg,
      keys: rootCaKeys,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        await x509.SubjectKeyIdentifierExtension.create(rootCaKeys.publicKey)
      ]
    });

    // generate intermediate server CA
    const serverIntermediateCaSerialNumber = createSerialNumber();
    const serverIntermediateCaIssuedAt = new Date();
    const serverIntermediateCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 10));
    const serverIntermediateCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const serverIntermediateCaSkObj = KeyObject.from(serverIntermediateCaKeys.privateKey);

    const serverIntermediateCaCert = await x509.X509CertificateGenerator.create({
      serialNumber: serverIntermediateCaSerialNumber,
      subject: "CN=KMIP Server Intermediate CA",
      issuer: rootCaCert.subject,
      notBefore: serverIntermediateCaIssuedAt,
      notAfter: serverIntermediateCaExpiration,
      signingKey: rootCaKeys.privateKey,
      publicKey: serverIntermediateCaKeys.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags.keyCertSign |
            x509.KeyUsageFlags.cRLSign |
            x509.KeyUsageFlags.digitalSignature |
            x509.KeyUsageFlags.keyEncipherment,
          true
        ),
        new x509.BasicConstraintsExtension(true, 0, true),
        await x509.AuthorityKeyIdentifierExtension.create(rootCaCert, false),
        await x509.SubjectKeyIdentifierExtension.create(serverIntermediateCaKeys.publicKey)
      ]
    });

    // generate intermediate client CA
    const clientIntermediateCaSerialNumber = createSerialNumber();
    const clientIntermediateCaIssuedAt = new Date();
    const clientIntermediateCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 10));
    const clientIntermediateCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const clientIntermediateCaSkObj = KeyObject.from(clientIntermediateCaKeys.privateKey);

    const clientIntermediateCaCert = await x509.X509CertificateGenerator.create({
      serialNumber: clientIntermediateCaSerialNumber,
      subject: "CN=KMIP Client Intermediate CA",
      issuer: rootCaCert.subject,
      notBefore: clientIntermediateCaIssuedAt,
      notAfter: clientIntermediateCaExpiration,
      signingKey: rootCaKeys.privateKey,
      publicKey: clientIntermediateCaKeys.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags.keyCertSign |
            x509.KeyUsageFlags.cRLSign |
            x509.KeyUsageFlags.digitalSignature |
            x509.KeyUsageFlags.keyEncipherment,
          true
        ),
        new x509.BasicConstraintsExtension(true, 0, true),
        await x509.AuthorityKeyIdentifierExtension.create(rootCaCert, false),
        await x509.SubjectKeyIdentifierExtension.create(clientIntermediateCaKeys.publicKey)
      ]
    });

    const encryptWithRoot = kmsService.encryptWithRootKey();

    await kmipInstanceConfigDAL.create({
      // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
      id: ADMIN_CONFIG_DB_UUID,
      caKeyAlgorithm,
      rootCaIssuedAt,
      rootCaExpiration,
      rootCaSerialNumber,
      encryptedRootCaCertificate: encryptWithRoot(Buffer.from(rootCaCert.rawData)),
      encryptedRootCaPrivateKey: encryptWithRoot(
        rootCaSkObj.export({
          type: "pkcs8",
          format: "der"
        })
      ),
      serverIntermediateCaIssuedAt,
      serverIntermediateCaExpiration,
      serverIntermediateCaSerialNumber,
      encryptedServerIntermediateCaCertificate: encryptWithRoot(
        Buffer.from(new Uint8Array(serverIntermediateCaCert.rawData))
      ),
      encryptedServerIntermediateCaChain: encryptWithRoot(Buffer.from(rootCaCert.toString("pem"))),
      encryptedServerIntermediateCaPrivateKey: encryptWithRoot(
        serverIntermediateCaSkObj.export({
          type: "pkcs8",
          format: "der"
        })
      ),
      clientIntermediateCaIssuedAt,
      clientIntermediateCaExpiration,
      clientIntermediateCaSerialNumber,
      encryptedClientIntermediateCaCertificate: encryptWithRoot(
        Buffer.from(new Uint8Array(clientIntermediateCaCert.rawData))
      ),
      encryptedClientIntermediateCaChain: encryptWithRoot(Buffer.from(rootCaCert.toString("pem"))),
      encryptedClientIntermediateCaPrivateKey: encryptWithRoot(
        clientIntermediateCaSkObj.export({
          type: "pkcs8",
          format: "der"
        })
      )
    });

    return {
      serverCertificateChain: `${serverIntermediateCaCert.toString("pem")}\n${rootCaCert.toString("pem")}`.trim(),
      clientCertificateChain: `${clientIntermediateCaCert.toString("pem")}\n${rootCaCert.toString("pem")}`.trim()
    };
  };

  const getInstanceKmip = async () => {
    const kmipInstanceConfig = await kmipInstanceConfigDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (!kmipInstanceConfig) {
      throw new BadRequestError({
        message: "KMIP has not been configured for the instance"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const rootCaCert = new x509.X509Certificate(decryptWithRoot(kmipInstanceConfig.encryptedRootCaCertificate));
    const serverIntermediateCaCert = new x509.X509Certificate(
      decryptWithRoot(kmipInstanceConfig.encryptedServerIntermediateCaCertificate)
    );
    const clientIntermediateCaCert = new x509.X509Certificate(
      decryptWithRoot(kmipInstanceConfig.encryptedClientIntermediateCaCertificate)
    );

    return {
      serverCertificateChain: `${serverIntermediateCaCert.toString("pem")}\n${rootCaCert.toString("pem")}`.trim(),
      clientCertificateChain: `${clientIntermediateCaCert.toString("pem")}\n${rootCaCert.toString("pem")}`.trim()
    };
  };

  const generateInstanceKmipServerCertificate = async ({
    ttl,
    commonName,
    altNames,
    keyAlgorithm
  }: TGenerateInstanceKmipServerCertificateDTO) => {
    const kmipInstanceConfig = await kmipInstanceConfigDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (!kmipInstanceConfig) {
      throw new InternalServerError({
        message: "KMIP has not been configured for the instance"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const caCertObj = new x509.X509Certificate(
      decryptWithRoot(kmipInstanceConfig.encryptedServerIntermediateCaCertificate)
    );

    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(ttl));

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
    const leafKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true)
    ];

    const altNamesArray: {
      type: "email" | "dns" | "ip";
      value: string;
    }[] = altNames
      .split(",")
      .map((name) => name.trim())
      .map((altName) => {
        // check if the altName is a valid hostname
        if (hostnameRegex.test(altName)) {
          return {
            type: "dns",
            value: altName
          };
        }

        // check if the altName is a valid IP
        if (isValidIp(altName)) {
          return {
            type: "ip",
            value: altName
          };
        }

        throw new Error(`Invalid altName: ${altName}`);
      });

    const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
    extensions.push(altNamesExtension);

    const caAlg = keyAlgorithmToAlgCfg(kmipInstanceConfig.caKeyAlgorithm as CertKeyAlgorithm);

    const decryptedCaCertChain = decryptWithRoot(kmipInstanceConfig.encryptedServerIntermediateCaChain).toString(
      "utf-8"
    );

    const caSkObj = crypto.createPrivateKey({
      key: decryptWithRoot(kmipInstanceConfig.encryptedServerIntermediateCaPrivateKey),
      format: "der",
      type: "pkcs8"
    });

    const caPrivateKey = await crypto.subtle.importKey(
      "pkcs8",
      caSkObj.export({ format: "der", type: "pkcs8" }),
      caAlg,
      true,
      ["sign"]
    );

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `CN=${commonName}`,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: leafKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const skLeafObj = KeyObject.from(leafKeys.privateKey);
    const certificateChain = `${caCertObj.toString("pem")}\n${decryptedCaCertChain}`.trim();

    await kmipInstanceServerCertificateDAL.create({
      keyAlgorithm,
      issuedAt: notBeforeDate,
      expiration: notAfterDate,
      serialNumber,
      commonName,
      altNames,
      encryptedCertificate: encryptWithRoot(Buffer.from(new Uint8Array(leafCert.rawData))),
      encryptedChain: encryptWithRoot(Buffer.from(certificateChain))
    });

    return {
      serialNumber,
      privateKey: skLeafObj.export({ format: "pem", type: "pkcs8" }) as string,
      certificate: leafCert.toString("pem"),
      certificateChain
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
    setupInstanceKmip,
    getInstanceKmip,
    generateInstanceKmipServerCertificate
  };
};
