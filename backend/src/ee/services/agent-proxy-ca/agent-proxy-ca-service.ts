import * as x509 from "@peculiar/x509";

import { OrganizationActionScope } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TOrgAgentProxyConfigDALFactory } from "./org-agent-proxy-config-dal";

export type TAgentProxyCaServiceFactory = ReturnType<typeof agentProxyCaServiceFactory>;

type TAgentProxyCaServiceFactoryDep = {
  orgAgentProxyConfigDAL: TOrgAgentProxyConfigDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

const ROOT_CA_ALGORITHM = CertKeyAlgorithm.ECDSA_P256;
// 7 days; the agent proxy re-signs a fresh intermediate before this elapses
const INTERMEDIATE_CA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Long-lived root so the trust anchor stays stable (agents pin it and do not refresh in V1).
// The private key never leaves Infisical and only signs short-lived intermediates.
const ROOT_CA_VALIDITY_YEARS = 10;
// Backdate notBefore so a fresh cert is not rejected by an agent whose clock trails the server's.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const agentProxyCaServiceFactory = ({
  orgAgentProxyConfigDAL,
  kmsService,
  licenseService,
  permissionService
}: TAgentProxyCaServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use the agent proxy."
      });
    }
  };

  // Validates the actor still belongs to the org. Any org member may call the CA endpoints (no dedicated subject).
  const $assertOrgMembership = async (actor: OrgServiceActor) => {
    await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });
  };

  // Lazily generates (once per org) and returns the org's root CA, decrypted for use.
  const $getOrgRootCa = async (orgId: string) => {
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const config = await orgAgentProxyConfigDAL.transaction(async (tx) => {
      const existing = await orgAgentProxyConfigDAL.findOne({ orgId }, tx);
      if (existing) return existing;

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgAgentProxyConfigInit(orgId)]);
      // re-check after acquiring the lock in case another instance created it
      const afterLock = await orgAgentProxyConfigDAL.findOne({ orgId }, tx);
      if (afterLock) return afterLock;

      const alg = keyAlgorithmToAlgCfg(ROOT_CA_ALGORITHM);
      const rootCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const rootCaSkObj = crypto.nativeCrypto.KeyObject.from(rootCaKeys.privateKey);

      const rootCaSerialNumber = createSerialNumber();
      const rootCaIssuedAt = new Date();
      const rootCaNotBefore = new Date(rootCaIssuedAt.getTime() - CLOCK_SKEW_MS);
      const rootCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + ROOT_CA_VALIDITY_YEARS));

      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `O=${orgId},CN=Infisical Agent Proxy Root CA`,
        serialNumber: rootCaSerialNumber,
        notBefore: rootCaNotBefore,
        notAfter: rootCaExpiration,
        signingAlgorithm: alg,
        keys: rootCaKeys,
        extensions: [
          // eslint-disable-next-line no-bitwise
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
          new x509.BasicConstraintsExtension(true, undefined, true),
          await x509.SubjectKeyIdentifierExtension.create(rootCaKeys.publicKey)
        ]
      });

      const encryptedRootCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(rootCaSkObj.export({ type: "pkcs8", format: "der" }))
      }).cipherTextBlob;
      const encryptedRootCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(rootCaCert.rawData)
      }).cipherTextBlob;

      return orgAgentProxyConfigDAL.create(
        {
          orgId,
          rootCaKeyAlgorithm: ROOT_CA_ALGORITHM,
          rootCaIssuedAt,
          rootCaExpiration,
          rootCaSerialNumber,
          encryptedRootCaCertificate,
          encryptedRootCaPrivateKey
        },
        tx
      );
    });

    const rootCaCertBuffer = orgKmsDecryptor({ cipherTextBlob: config.encryptedRootCaCertificate });
    const rootCaPrivateKeyBuffer = orgKmsDecryptor({ cipherTextBlob: config.encryptedRootCaPrivateKey });
    const rootCaCert = new x509.X509Certificate(rootCaCertBuffer);

    return { config, rootCaCert, rootCaPrivateKeyBuffer };
  };

  // Returns the org's public root CA certificate (auto-creating it on first access).
  const getRootCa = async (actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);
    await $assertOrgMembership(actor);

    const { config, rootCaCert } = await $getOrgRootCa(actor.orgId);
    return {
      certificate: rootCaCert.toString("pem"),
      // the column is a plain string in the generated schema but only ever stores ROOT_CA_ALGORITHM
      keyAlgorithm: config.rootCaKeyAlgorithm as CertKeyAlgorithm,
      issuedAt: config.rootCaIssuedAt,
      expiration: config.rootCaExpiration,
      serialNumber: config.rootCaSerialNumber
    };
  };

  // Signs a caller-provided public key as a short-lived intermediate CA chained to the org root CA.
  const signIntermediate = async (actor: OrgServiceActor, publicKeyPem: string) => {
    await $checkLicense(actor.orgId);
    await $assertOrgMembership(actor);

    const { rootCaCert, rootCaPrivateKeyBuffer } = await $getOrgRootCa(actor.orgId);

    // Refuse to sign against an expired root: the resulting chain could never validate.
    if (new Date() >= rootCaCert.notAfter) {
      throw new BadRequestError({
        message: "The organization's agent proxy root CA has expired and can no longer sign intermediate certificates."
      });
    }

    const alg = keyAlgorithmToAlgCfg(ROOT_CA_ALGORITHM);

    let intermediatePublicKey: CryptoKey;
    try {
      const publicKeyObj = crypto.nativeCrypto.createPublicKey({ key: publicKeyPem, format: "pem" });
      intermediatePublicKey = await crypto.nativeCrypto.subtle.importKey(
        "spki",
        publicKeyObj.export({ format: "der", type: "spki" }),
        alg,
        true,
        []
      );
    } catch {
      throw new BadRequestError({ message: "Invalid public key: must be an ECDSA P-256 public key in PEM format" });
    }

    const rootCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: rootCaPrivateKeyBuffer,
      format: "der",
      type: "pkcs8"
    });
    const importedRootCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      rootCaSkObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const serialNumber = createSerialNumber();
    const issuedAt = new Date();
    const notBefore = new Date(issuedAt.getTime() - CLOCK_SKEW_MS);
    // Clamp so an intermediate can never outlive the root it chains to.
    const requestedExpiration = new Date(issuedAt.getTime() + INTERMEDIATE_CA_TTL_MS);
    const expiration = requestedExpiration < rootCaCert.notAfter ? requestedExpiration : rootCaCert.notAfter;

    const intermediateCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `O=${actor.orgId},CN=Infisical Agent Proxy Intermediate CA`,
      issuer: rootCaCert.subject,
      notBefore,
      notAfter: expiration,
      signingKey: importedRootCaPrivateKey,
      publicKey: intermediatePublicKey,
      signingAlgorithm: alg,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        new x509.BasicConstraintsExtension(true, 0, true),
        await x509.AuthorityKeyIdentifierExtension.create(rootCaCert, false),
        await x509.SubjectKeyIdentifierExtension.create(intermediatePublicKey)
      ]
    });

    return {
      certificate: intermediateCert.toString("pem"),
      issuedAt,
      expiration,
      serialNumber
    };
  };

  return {
    getRootCa,
    signIntermediate
  };
};
