import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

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
import { TOrgGatewayRootCaDALFactory } from "./org-gateway-root-ca-dal";

type TGatewayServiceFactoryDep = {
  gatewayDAL: TGatewayDALFactory;
  orgGatewayRootCaDAL: Pick<TOrgGatewayRootCaDALFactory, "findOne" | "create" | "transaction">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures" | "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TGatewayServiceFactory = ReturnType<typeof gatewayServiceFactory>;

// TODO(gateway): missing permission check
export const gatewayServiceFactory = ({
  gatewayDAL,
  licenseService,
  orgGatewayRootCaDAL,
  kmsService,
  permissionService
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
      !envCfg.GATEWAY_INFISICAL_STATIC_IP_ADDRESS
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

    const orgGatewayRootCa = await orgGatewayRootCaDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgGatewayRootCaInit(identityOrg)]);
      const existingGateway = await orgGatewayRootCaDAL.findOne({ orgId: identityOrg });
      if (existingGateway) return existingGateway;
      const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
      // generate root CA
      const orgGatewayRootCaSerialNumber = createSerialNumber();
      const orgGatewayRootCaKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const orgGatewayCaSkObj = crypto.KeyObject.from(orgGatewayRootCaKeys.privateKey);
      const orgGatewayCaIssuedAt = new Date();
      const orgGatewayCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 25));

      const orgGatewayCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `CN=Org Gateway Root CA,O=${identityOrg}`,
        serialNumber: orgGatewayRootCaSerialNumber,
        notBefore: orgGatewayCaIssuedAt,
        notAfter: orgGatewayCaExpiration,
        signingAlgorithm: alg,
        keys: orgGatewayRootCaKeys,
        extensions: [
          // eslint-disable-next-line no-bitwise
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
          await x509.SubjectKeyIdentifierExtension.create(orgGatewayRootCaKeys.publicKey)
        ]
      });

      return orgGatewayRootCaDAL.create({
        orgId: identityOrg,
        caIssuedAt: orgGatewayCaIssuedAt,
        caExpiration: orgGatewayCaExpiration,
        caSerialNumber: orgGatewayRootCaSerialNumber,
        encryptedCaCertificate: orgKmsEncryptor({ plainText: Buffer.from(orgGatewayCaCert.rawData) }).cipherTextBlob,
        encryptedCaPrivateKey: orgKmsEncryptor({
          plainText: orgGatewayCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        }).cipherTextBlob,
        caKeyAlgorithm: CertKeyAlgorithm.RSA_2048
      });
    });

    const caCertObj = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayRootCa.encryptedCaCertificate
      })
    );
    const caAlg = keyAlgorithmToAlgCfg(orgGatewayRootCa.caKeyAlgorithm as CertKeyAlgorithm);
    const caSkObj = crypto.createPrivateKey({
      key: orgKmsDecryptor({ cipherTextBlob: orgGatewayRootCa.encryptedCaPrivateKey }),
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

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const gatewayKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const certIssuedAt = new Date();
    // then need to periodically init
    const certExpireAt = new Date(new Date().setMonth(new Date().getMonth() + 1));
    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(gatewayKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true),
      // san
      new x509.SubjectAlternativeNameExtension([{ type: "ip", value: relayAddress }], false)
    ];

    const serialNumber = createSerialNumber();
    const privateKey = crypto.KeyObject.from(gatewayKeys.privateKey);
    const gatewayCertificate = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `CN=${identityId},O=${identityOrg}`,
      issuer: caCertObj.subject,
      notBefore: certIssuedAt,
      notAfter: certExpireAt,
      signingKey: caPrivateKey,
      publicKey: gatewayKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    await gatewayDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgGatewayCertExchange(identityOrg)]);
      const existingGateway = await gatewayDAL.findOne({ identityId, orgGatewayRootCaId: orgGatewayRootCa.id });
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
        orgGatewayRootCaId: orgGatewayRootCa.id,
        name: alphaNumericNanoId(8)
      });
    });

    return {
      serialNumber,
      privateKey: privateKey.export({ format: "pem", type: "pkcs8" }) as string,
      certificate: gatewayCertificate.toString("pem"),
      certificateChain: caCertObj.toString("pem")
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
    ForbiddenError.from(permission).throwUnlessCan(OrgGatewayPermissionActions.Create, OrgPermissionSubjects.Gateway);
    const rootCa = await orgGatewayRootCaDAL.findOne({ orgId: orgPermission.orgId });
    if (!rootCa) return [];

    const gateways = await gatewayDAL.find({
      orgGatewayRootCaId: rootCa.id
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
    ForbiddenError.from(permission).throwUnlessCan(OrgGatewayPermissionActions.Create, OrgPermissionSubjects.Gateway);
    const rootCa = await orgGatewayRootCaDAL.findOne({ orgId: orgPermission.orgId });
    if (!rootCa) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    const [gateway] = await gatewayDAL.find({ id, orgGatewayRootCaId: rootCa.id });
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
    ForbiddenError.from(permission).throwUnlessCan(OrgGatewayPermissionActions.Create, OrgPermissionSubjects.Gateway);
    const rootCa = await orgGatewayRootCaDAL.findOne({ orgId: orgPermission.orgId });
    if (!rootCa) throw new NotFoundError({ message: `Gateway with ID ${id} not found.` });

    const [gateway] = await gatewayDAL.delete({ id, orgGatewayRootCaId: rootCa.id });
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
