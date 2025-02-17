import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import fs from "fs/promises";
import path from "path/posix";

import { PgSqlLock } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { getTurnCredentials } from "@app/lib/turn/credentials";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgGatewayPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TGatewayDALFactory } from "./gateway-dal";
import { TExchangeAllocatedRelayAddressDTO, TGetGatewayByIdDTO, TListGatewaysDTO } from "./gateway-types";
import { TOrgGatewayConfigDALFactory } from "./org-gateway-config-dal";

type TGatewayServiceFactoryDep = {
  gatewayDAL: TGatewayDALFactory;
  orgGatewayConfigDAL: Pick<TOrgGatewayConfigDALFactory, "findOne" | "create" | "transaction">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures" | "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithRootKey">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TGatewayServiceFactory = ReturnType<typeof gatewayServiceFactory>;

// TODO(gateway): missing permission check
export const gatewayServiceFactory = ({
  gatewayDAL,
  licenseService,
  kmsService,
  permissionService,
  orgGatewayConfigDAL
}: TGatewayServiceFactoryDep) => {
  const $validateOrgAccessToGateway = async (orgId: string) => {
    if (!licenseService.onPremFeatures.gateway) {
      throw new BadRequestError({
        message:
          "Gateway handshake failed due to instance plan restrictions. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }
    const orgLicensePlan = await licenseService.getPlan(orgId);
    if (!orgLicensePlan.gateway) {
      throw new BadRequestError({
        message:
          "Gateway handshake failed due to organization plan restrictions. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }
  };

  const getGatewayRelayDetails = async (actorId: string, actorOrgId: string) => {
    const envCfg = getConfig();
    await $validateOrgAccessToGateway(actorOrgId);

    if (
      !envCfg.GATEWAY_RELAY_AUTH_SECRET ||
      !envCfg.GATEWAY_RELAY_ADDRESS ||
      !envCfg.GATEWAY_INFISICAL_STATIC_IP_ADDRESS ||
      !envCfg.GATEWAY_RELAY_REALM
    ) {
      throw new BadRequestError({
        message: "Gateway handshake failed due to missing instance config."
      });
    }
    // TODO(gateway): keep it in 30mins redis after encryption to avoid multiple credentials spinning up
    const { username: turnServerUsername, password: turnServerPassword } = getTurnCredentials(
      actorId,
      envCfg.GATEWAY_RELAY_AUTH_SECRET
    );

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
    relayAddress
  }: TExchangeAllocatedRelayAddressDTO) => {
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
      const rootCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const rootCaSerialNumber = createSerialNumber();
      const rootCaSkObj = crypto.KeyObject.from(rootCaKeys.privateKey);
      const rootCaIssuedAt = new Date();
      const rootCaKeyAlgorithm = CertKeyAlgorithm.RSA_2048;
      const rootCaExpiration = new Date(new Date().setFullYear(2045));
      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: "CN=Infisical Gateway Root CA",
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
      const clientCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const clientCaSkObj = crypto.KeyObject.from(clientCaKeys.privateKey);

      const clientCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: clientCaSerialNumber,
        subject: "CN=Client Intermediate CA",
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

      const clientKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const clientCertSerialNumber = createSerialNumber();
      const clientCert = await x509.X509CertificateGenerator.create({
        serialNumber: clientCertSerialNumber,
        subject: "O=infisical,OU=gateway,CN=cloud-client",
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
      const clientSkObj = crypto.KeyObject.from(clientKeys.privateKey);

      // generate gateway ca
      const gatewayCaSerialNumber = createSerialNumber();
      const gatewayCaIssuedAt = new Date();
      const gatewayCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 10));
      const gatewayCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const gatewayCaSkObj = crypto.KeyObject.from(gatewayCaKeys.privateKey);
      const gatewayCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: gatewayCaSerialNumber,
        subject: "CN=KMIP Server Intermediate CA",
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

      await fs.writeFile(path.join(__dirname, "./root-ca-cert"), rootCaCert.toString("pem"));
      await fs.writeFile(path.join(__dirname, "./client-ca-cert"), clientCaCert.toString("pem"));
      await fs.writeFile(path.join(__dirname, "./gateway-ca-cert"), gatewayCaCert.toString("pem"));
      await fs.writeFile(path.join(__dirname, "./client-cert"), clientCert.toString("pem"));
      await fs.writeFile(
        path.join(__dirname, "./client-key"),
        clientSkObj.export({ type: "pkcs8", format: "pem" }) as string
      );

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
    const gatewayCaSkObj = crypto.createPrivateKey({
      key: orgKmsDecryptor({ cipherTextBlob: orgGatewayConfig.encryptedGatewayCaPrivateKey }),
      format: "der",
      type: "pkcs8"
    });
    const gatewayCaPrivateKey = await crypto.subtle.importKey(
      "pkcs8",
      gatewayCaSkObj.export({ format: "der", type: "pkcs8" }),
      gatewayCaAlg,
      true,
      ["sign"]
    );

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const gatewayKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const certIssuedAt = new Date();
    // then need to periodically init
    const certExpireAt = new Date(new Date().setMonth(new Date().getMonth() + 1));

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(rootCaCert, false),
      await x509.SubjectKeyIdentifierExtension.create(gatewayKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true),
      // san
      // TODO(gateway): change this later
      new x509.SubjectAlternativeNameExtension([{ type: "ip", value: "127.0.0.1" }], false)
    ];

    const serialNumber = createSerialNumber();
    const privateKey = crypto.KeyObject.from(gatewayKeys.privateKey);
    const gatewayCertificate = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `CN=${identityId},O=${identityOrg}`,
      issuer: rootCaCert.subject,
      notBefore: certIssuedAt,
      notAfter: certExpireAt,
      signingKey: gatewayCaPrivateKey,
      publicKey: gatewayKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    await gatewayDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgGatewayCertExchange(identityOrg)]);
      const existingGateway = await gatewayDAL.findOne({ identityId, orgGatewayRootCaId: orgGatewayConfig.id });
      if (existingGateway) {
        return gatewayDAL.updateById(existingGateway.id, {
          keyAlgorithm: CertKeyAlgorithm.RSA_2048,
          issuedAt: certIssuedAt,
          expiration: certExpireAt,
          serialNumber,
          relayAddress: orgKmsEncryptor({ plainText: Buffer.from(relayAddress) }).cipherTextBlob
        });
      }

      return gatewayDAL.create({
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        issuedAt: certIssuedAt,
        expiration: certExpireAt,
        serialNumber,
        relayAddress: orgKmsEncryptor({ plainText: Buffer.from(relayAddress) }).cipherTextBlob,
        identityId,
        orgGatewayRootCaId: orgGatewayConfig.id,
        name: alphaNumericNanoId(8)
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

  const listGateways = async ({ orgPermission }: TListGatewaysDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgGatewayPermissionActions.Read, OrgPermissionSubjects.Gateway);
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) return [];

    const gateways = await gatewayDAL.find({
      orgGatewayRootCaId: orgGatewayConfig.id
    });
    return gateways;
  };

  const getGatewayById = async ({ orgPermission, id }: TGetGatewayByIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgGatewayPermissionActions.Read, OrgPermissionSubjects.Gateway);
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    const [gateway] = await gatewayDAL.find({ id, orgGatewayRootCaId: orgGatewayConfig.id });
    if (!gateway) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });
    return gateway;
  };

  const deleteGatewayById = async ({ orgPermission, id }: TGetGatewayByIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgGatewayPermissionActions.Delete, OrgPermissionSubjects.Gateway);
    const orgGatewayConfig = await orgGatewayConfigDAL.findOne({ orgId: orgPermission.orgId });
    if (!orgGatewayConfig) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    const [gateway] = await gatewayDAL.delete({ id, orgGatewayRootCaId: orgGatewayConfig.id });
    if (!gateway) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });
    return gateway;
  };

  return {
    getGatewayRelayDetails,
    exchangeAllocatedRelayAddress,
    listGateways,
    getGatewayById,
    deleteGatewayById
  };
};
