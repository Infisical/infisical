import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { z } from "zod";

import { OrganizationActionScope } from "@app/db/schemas/models";
import { KeyStorePrefixes, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { pingGatewayAndVerify } from "@app/lib/gateway";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { getTurnCredentials } from "@app/lib/turn/credentials";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TGatewayDALFactory } from "./gateway-dal";
import {
  TExchangeAllocatedRelayAddressDTO,
  TGetGatewayByIdDTO,
  THeartBeatDTO,
  TListGatewaysDTO,
  TUpdateGatewayByIdDTO
} from "./gateway-types";
import { TOrgGatewayConfigDALFactory } from "./org-gateway-config-dal";

type TGatewayServiceFactoryDep = {
  gatewayDAL: TGatewayDALFactory;
  orgGatewayConfigDAL: Pick<TOrgGatewayConfigDALFactory, "findOne" | "create" | "transaction" | "findById">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures" | "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithRootKey">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TGatewayServiceFactory = ReturnType<typeof gatewayServiceFactory>;
const TURN_SERVER_CREDENTIALS_SCHEMA = z.object({
  username: z.string(),
  password: z.string()
});

export const gatewayServiceFactory = ({
  gatewayDAL,
  licenseService,
  kmsService,
  permissionService,
  orgGatewayConfigDAL,
  keyStore
}: TGatewayServiceFactoryDep) => {
  const $validateOrgAccessToGateway = async (orgId: string, actorId: string, actorAuthMethod: ActorAuthMethod) => {
    // if (!licenseService.onPremFeatures.gateway) {
    //   throw new BadRequestError({
    //     message:
    //       "Gateway handshake failed due to instance plan restrictions. Please upgrade your instance to Infisical's Enterprise plan."
    //   });
    // }
    const orgLicensePlan = await licenseService.getPlan(orgId);
    if (!orgLicensePlan.gateway) {
      throw new BadRequestError({
        message:
          "Gateway handshake failed due to organization plan restrictions. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.IDENTITY,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId: orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );
  };

  const getGatewayRelayDetails = async (actorId: string, actorOrgId: string, actorAuthMethod: ActorAuthMethod) => {
    const TURN_CRED_EXPIRY = 10 * 60; // 10 minutes

    const envCfg = getConfig();
    await $validateOrgAccessToGateway(actorOrgId, actorId, actorAuthMethod);
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    if (!envCfg.GATEWAY_RELAY_AUTH_SECRET || !envCfg.GATEWAY_RELAY_ADDRESS || !envCfg.GATEWAY_RELAY_REALM) {
      throw new BadRequestError({
        message: "Gateway handshake failed due to missing instance configuration."
      });
    }

    let turnServerUsername = "";
    let turnServerPassword = "";
    // keep it in redis for 5mins to avoid generating so many credentials
    const previousCredential = await keyStore.getItem(KeyStorePrefixes.GatewayIdentityCredential(actorId));
    if (previousCredential) {
      const el = await TURN_SERVER_CREDENTIALS_SCHEMA.parseAsync(
        JSON.parse(decryptor({ cipherTextBlob: Buffer.from(previousCredential, "hex") }).toString())
      );
      turnServerUsername = el.username;
      turnServerPassword = el.password;
    } else {
      const el = getTurnCredentials(actorId, envCfg.GATEWAY_RELAY_AUTH_SECRET);
      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.GatewayIdentityCredential(actorId),
        TURN_CRED_EXPIRY,
        encryptor({
          plainText: Buffer.from(JSON.stringify({ username: el.username, password: el.password }))
        }).cipherTextBlob.toString("hex")
      );
      turnServerUsername = el.username;
      turnServerPassword = el.password;
    }

    return {
      turnServerUsername,
      turnServerPassword,
      turnServerRealm: envCfg.GATEWAY_RELAY_REALM,
      turnServerAddress: envCfg.GATEWAY_RELAY_ADDRESS,
      infisicalStaticIp: envCfg.GATEWAY_INFISICAL_STATIC_IP_ADDRESS
    };
  };

  const exchangeAllocatedRelayAddress = async ({
    identityId,
    identityOrg,
    relayAddress,
    identityOrgAuthMethod
  }: TExchangeAllocatedRelayAddressDTO) => {
    await $validateOrgAccessToGateway(identityOrg, identityId, identityOrgAuthMethod);
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityOrg
    });

    const orgGatewayConfig = await orgGatewayConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgGatewayRootCaInit(identityOrg)]);
      const existingGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: identityOrg });
      if (existingGatewayConfig) return existingGatewayConfig;

      const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
      // generate root CA
      const rootCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const rootCaSerialNumber = createSerialNumber();
      const rootCaSkObj = crypto.nativeCrypto.KeyObject.from(rootCaKeys.privateKey);
      const rootCaIssuedAt = new Date();
      const rootCaKeyAlgorithm = CertKeyAlgorithm.RSA_2048;
      const rootCaExpiration = new Date(new Date().setFullYear(2045));
      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `O=${identityOrg},CN=Infisical Gateway Root CA`,
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

      // generate client ca
      const clientCaSerialNumber = createSerialNumber();
      const clientCaIssuedAt = new Date();
      const clientCaExpiration = new Date(new Date().setFullYear(2045));
      const clientCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const clientCaSkObj = crypto.nativeCrypto.KeyObject.from(clientCaKeys.privateKey);

      const clientCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: clientCaSerialNumber,
        subject: `O=${identityOrg},CN=Client Intermediate CA`,
        issuer: rootCaCert.subject,
        notBefore: clientCaIssuedAt,
        notAfter: clientCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: clientCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(clientCaKeys.publicKey)
        ]
      });

      const clientKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const clientCertSerialNumber = createSerialNumber();
      const clientCert = await x509.X509CertificateGenerator.create({
        serialNumber: clientCertSerialNumber,
        subject: `O=${identityOrg},OU=gateway-client,CN=cloud`,
        issuer: clientCaCert.subject,
        notAfter: clientCaExpiration,
        notBefore: clientCaIssuedAt,
        signingKey: clientCaKeys.privateKey,
        publicKey: clientKeys.publicKey,
        signingAlgorithm: alg,
        extensions: [
          new x509.BasicConstraintsExtension(false),
          await x509.AuthorityKeyIdentifierExtension.create(clientCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(clientKeys.publicKey),
          new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
          new x509.KeyUsagesExtension(
            // eslint-disable-next-line no-bitwise
            x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] |
              x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT] |
              x509.KeyUsageFlags[CertKeyUsage.KEY_AGREEMENT],
            true
          ),
          new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.CLIENT_AUTH]], true)
        ]
      });
      const clientSkObj = crypto.nativeCrypto.KeyObject.from(clientKeys.privateKey);

      // generate gateway ca
      const gatewayCaSerialNumber = createSerialNumber();
      const gatewayCaIssuedAt = new Date();
      const gatewayCaExpiration = new Date(new Date().setFullYear(2045));
      const gatewayCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const gatewayCaSkObj = crypto.nativeCrypto.KeyObject.from(gatewayCaKeys.privateKey);
      const gatewayCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: gatewayCaSerialNumber,
        subject: `O=${identityOrg},CN=Gateway CA`,
        issuer: rootCaCert.subject,
        notBefore: gatewayCaIssuedAt,
        notAfter: gatewayCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: gatewayCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(gatewayCaKeys.publicKey)
        ]
      });

      return orgGatewayConfigDAL.create({
        orgId: identityOrg,
        rootCaIssuedAt,
        rootCaExpiration,
        rootCaSerialNumber,
        rootCaKeyAlgorithm,
        encryptedRootCaPrivateKey: orgKmsEncryptor({
          plainText: rootCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        }).cipherTextBlob,
        encryptedRootCaCertificate: orgKmsEncryptor({ plainText: Buffer.from(rootCaCert.rawData) }).cipherTextBlob,

        clientCaIssuedAt,
        clientCaExpiration,
        clientCaSerialNumber,
        encryptedClientCaPrivateKey: orgKmsEncryptor({
          plainText: clientCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        }).cipherTextBlob,
        encryptedClientCaCertificate: orgKmsEncryptor({
          plainText: Buffer.from(clientCaCert.rawData)
        }).cipherTextBlob,

        clientCertIssuedAt: clientCaIssuedAt,
        clientCertExpiration: clientCaExpiration,
        clientCertKeyAlgorithm: CertKeyAlgorithm.RSA_2048,
        clientCertSerialNumber,
        encryptedClientPrivateKey: orgKmsEncryptor({
          plainText: clientSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        }).cipherTextBlob,
        encryptedClientCertificate: orgKmsEncryptor({
          plainText: Buffer.from(clientCert.rawData)
        }).cipherTextBlob,

        gatewayCaIssuedAt,
        gatewayCaExpiration,
        gatewayCaSerialNumber,
        encryptedGatewayCaPrivateKey: orgKmsEncryptor({
          plainText: gatewayCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        }).cipherTextBlob,
        encryptedGatewayCaCertificate: orgKmsEncryptor({
          plainText: Buffer.from(gatewayCaCert.rawData)
        }).cipherTextBlob
      });
    });

    const rootCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedRootCaCertificate
      })
    );
    const clientCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedClientCaCertificate
      })
    );

    const gatewayCaAlg = keyAlgorithmToAlgCfg(orgGatewayConfig.rootCaKeyAlgorithm as CertKeyAlgorithm);
    const gatewayCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: orgKmsDecryptor({ cipherTextBlob: orgGatewayConfig.encryptedGatewayCaPrivateKey }),
      format: "der",
      type: "pkcs8"
    });
    const gatewayCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedGatewayCaCertificate
      })
    );

    const gatewayCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      gatewayCaSkObj.export({ format: "der", type: "pkcs8" }),
      gatewayCaAlg,
      true,
      ["sign"]
    );

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const gatewayKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const certIssuedAt = new Date();
    // then need to periodically init
    const certExpireAt = new Date(new Date().setMonth(new Date().getMonth() + 1));

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(gatewayCaCert, false),
      await x509.SubjectKeyIdentifierExtension.create(gatewayKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true),
      // san
      new x509.SubjectAlternativeNameExtension([{ type: "ip", value: relayAddress.split(":")[0] }], false)
    ];

    const serialNumber = createSerialNumber();
    const privateKey = crypto.nativeCrypto.KeyObject.from(gatewayKeys.privateKey);
    const gatewayCertificate = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `CN=${identityId},O=${identityOrg},OU=Gateway`,
      issuer: gatewayCaCert.subject,
      notBefore: certIssuedAt,
      notAfter: certExpireAt,
      signingKey: gatewayCaPrivateKey,
      publicKey: gatewayKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const appCfg = getConfig();
    // just for local development
    const formatedRelayAddress =
      appCfg.NODE_ENV === "development" ? relayAddress.replace("127.0.0.1", "host.docker.internal") : relayAddress;

    await gatewayDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgGatewayCertExchange(identityOrg)]);
      const existingGateway = await gatewayDAL.findOne({ identityId, orgGatewayRootCaId: orgGatewayConfig.id });

      if (existingGateway) {
        return gatewayDAL.updateById(existingGateway.id, {
          keyAlgorithm: CertKeyAlgorithm.RSA_2048,
          issuedAt: certIssuedAt,
          expiration: certExpireAt,
          serialNumber,
          relayAddress: orgKmsEncryptor({
            plainText: Buffer.from(formatedRelayAddress)
          }).cipherTextBlob
        });
      }

      return gatewayDAL.create({
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        issuedAt: certIssuedAt,
        expiration: certExpireAt,
        serialNumber,
        relayAddress: orgKmsEncryptor({
          plainText: Buffer.from(formatedRelayAddress)
        }).cipherTextBlob,
        identityId,
        orgGatewayRootCaId: orgGatewayConfig.id,
        name: `gateway-${alphaNumericNanoId(6).toLowerCase()}`
      });
    });

    const gatewayCertificateChain = `${clientCaCert.toString("pem")}\n${rootCaCert.toString("pem")}`.trim();

    return {
      serialNumber,
      privateKey: privateKey.export({ format: "pem", type: "pkcs8" }) as string,
      certificate: gatewayCertificate.toString("pem"),
      certificateChain: gatewayCertificateChain
    };
  };

  const heartbeat = async ({ orgPermission }: THeartBeatDTO) => {
    await $validateOrgAccessToGateway(orgPermission.orgId, orgPermission.id, orgPermission.authMethod);
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) throw new NotFoundError({ message: `Identity with ID ${orgPermission.id} not found.` });

    const [gateway] = await gatewayDAL.find({ identityId: orgPermission.id, orgGatewayRootCaId: orgGatewayConfig.id });
    if (!gateway) throw new NotFoundError({ message: `Gateway with ID ${orgPermission.id} not found.` });

    const { decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgGatewayConfig.orgId
    });

    const rootCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedRootCaCertificate
      })
    );
    const gatewayCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedGatewayCaCertificate
      })
    );
    const clientCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedClientCertificate
      })
    );

    const privateKey = crypto.nativeCrypto
      .createPrivateKey({
        key: orgKmsDecryptor({ cipherTextBlob: orgGatewayConfig.encryptedClientPrivateKey }),
        format: "der",
        type: "pkcs8"
      })
      .export({ type: "pkcs8", format: "pem" });

    const relayAddress = orgKmsDecryptor({ cipherTextBlob: gateway.relayAddress }).toString();
    const [relayHost, relayPort] = relayAddress.split(":");

    await pingGatewayAndVerify({
      relayHost,
      relayPort: Number(relayPort),
      tlsOptions: {
        key: privateKey.toString(),
        ca: `${gatewayCaCert.toString("pem")}\n${rootCaCert.toString("pem")}`.trim(),
        cert: clientCert.toString("pem")
      },
      identityId: orgPermission.id,
      orgId: orgPermission.orgId
    });

    await gatewayDAL.updateById(gateway.id, { heartbeat: new Date() });
  };

  const listGateways = async ({ orgPermission }: TListGatewaysDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.ListGateways,
      OrgPermissionSubjects.Gateway
    );
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) return [];

    const gateways = await gatewayDAL.find({
      orgGatewayRootCaId: orgGatewayConfig.id
    });
    return gateways;
  };

  const getGatewayById = async ({ orgPermission, id }: TGetGatewayByIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.ListGateways,
      OrgPermissionSubjects.Gateway
    );
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    const [gateway] = await gatewayDAL.find({ id, orgGatewayRootCaId: orgGatewayConfig.id });
    if (!gateway) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });
    return gateway;
  };

  const updateGatewayById = async ({ orgPermission, id, name }: TUpdateGatewayByIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.EditGateways,
      OrgPermissionSubjects.Gateway
    );
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    const [gateway] = await gatewayDAL.update({ id, orgGatewayRootCaId: orgGatewayConfig.id }, { name });
    if (!gateway) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    return gateway;
  };

  const deleteGatewayById = async ({ orgPermission, id }: TGetGatewayByIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.DeleteGateways,
      OrgPermissionSubjects.Gateway
    );
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    const [gateway] = await gatewayDAL.delete({ id, orgGatewayRootCaId: orgGatewayConfig.id });
    if (!gateway) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });
    return gateway;
  };

  const fnGetGatewayClientTlsByGatewayId = async (gatewayId: string) => {
    const gateway = await gatewayDAL.findById(gatewayId);
    if (!gateway) throw new NotFoundError({ message: `Gateway with ID ${gatewayId} not found.` });

    const orgGatewayConfig = await orgGatewayConfigDAL.findById(gateway.orgGatewayRootCaId);

    const orgLicensePlan = await licenseService.getPlan(orgGatewayConfig.orgId);
    if (!orgLicensePlan.gateway) {
      throw new BadRequestError({
        message: "Please upgrade your instance to Infisical's Enterprise plan to use gateways."
      });
    }

    const { decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgGatewayConfig.orgId
    });

    const rootCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedRootCaCertificate
      })
    );
    const gatewayCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedGatewayCaCertificate
      })
    );
    const clientCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedClientCertificate
      })
    );

    const clientSkObj = crypto.nativeCrypto.createPrivateKey({
      key: orgKmsDecryptor({ cipherTextBlob: orgGatewayConfig.encryptedClientPrivateKey }),
      format: "der",
      type: "pkcs8"
    });

    return {
      relayAddress: orgKmsDecryptor({ cipherTextBlob: gateway.relayAddress }).toString(),
      privateKey: clientSkObj.export({ type: "pkcs8", format: "pem" }),
      certificate: clientCert.toString("pem"),
      certChain: `${gatewayCaCert.toString("pem")}\n${rootCaCert.toString("pem")}`.trim(),
      identityId: gateway.identityId,
      orgId: orgGatewayConfig.orgId
    };
  };

  return {
    getGatewayRelayDetails,
    exchangeAllocatedRelayAddress,
    listGateways,
    getGatewayById,
    updateGatewayById,
    deleteGatewayById,
    fnGetGatewayClientTlsByGatewayId,
    heartbeat
  };
};
