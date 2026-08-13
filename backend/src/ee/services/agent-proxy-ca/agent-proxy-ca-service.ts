import * as x509 from "@peculiar/x509";

import { OrganizationActionScope, ResourceType } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { TAgentGatewaySessionDALFactory } from "../agent-gateway/agent-gateway-session-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TOrgAgentProxyConfigDALFactory } from "./org-agent-proxy-config-dal";

export type TAgentProxyCaServiceFactory = ReturnType<typeof agentProxyCaServiceFactory>;

type TAgentProxyCaServiceFactoryDep = {
  orgAgentProxyConfigDAL: TOrgAgentProxyConfigDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  agentGatewaySessionDAL: Pick<TAgentGatewaySessionDALFactory, "countActiveByGatewayId">;
  membershipDAL: Pick<TMembershipDALFactory, "countResourceMembershipsForActor">;
};

const ROOT_CA_ALGORITHM = CertKeyAlgorithm.ECDSA_P256;
// 24 hours, not 7 days. This certificate can mint a leaf for any hostname, so its lifetime is the window
// in which a compromised broker keeps that power. The gateway re-signs well before expiry, so shortening it
// costs one extra signing call a day.
const INTERMEDIATE_CA_TTL_MS = 24 * 60 * 60 * 1000;
const ROOT_CA_VALIDITY_YEARS = 10;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const agentProxyCaServiceFactory = ({
  orgAgentProxyConfigDAL,
  kmsService,
  licenseService,
  permissionService,
  agentGatewaySessionDAL,
  membershipDAL
}: TAgentProxyCaServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use the agent proxy."
      });
    }
  };

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

  // A gateway qualifies while it is actually serving an agent gateway session, because that is when it
  // needs to terminate TLS. A user or identity qualifies when they are on at least one agent gateway's
  // access list, which is what local mode needs. Anything else is an org member with no reason to hold a
  // signing certificate, and used to be allowed.
  const assertMayMintIntermediate = async (actor: OrgServiceActor) => {
    if (actor.type === ActorType.GATEWAY) {
      const activeSessions = await agentGatewaySessionDAL.countActiveByGatewayId(actor.id);
      if (activeSessions > 0) return;
      throw new ForbiddenRequestError({
        message: "This Gateway is not currently brokering any Agent Gateway session"
      });
    }

    await $assertOrgMembership(actor);

    if (actor.type === ActorType.USER || actor.type === ActorType.IDENTITY) {
      const grants = await membershipDAL.countResourceMembershipsForActor({
        resourceType: ResourceType.AgentGateway,
        actorType: actor.type,
        actorId: actor.id
      });
      if (grants > 0) return;
    }

    throw new ForbiddenRequestError({
      message: "You are not on the access list for any Agent Gateway, so no signing certificate can be issued to you"
    });
  };

  const $getOrgRootCa = async (orgId: string) => {
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const config = await orgAgentProxyConfigDAL.transaction(async (tx) => {
      const existing = await orgAgentProxyConfigDAL.findOne({ orgId }, tx);
      if (existing) return existing;

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgAgentProxyConfigInit(orgId)]);
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

  const getRootCa = async (actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);
    await $assertOrgMembership(actor);

    const { config, rootCaCert } = await $getOrgRootCa(actor.orgId);
    return {
      certificate: rootCaCert.toString("pem"),
      // column is a plain string in the generated schema but only ever stores ROOT_CA_ALGORITHM
      keyAlgorithm: config.rootCaKeyAlgorithm as CertKeyAlgorithm,
      issuedAt: config.rootCaIssuedAt,
      expiration: config.rootCaExpiration,
      serialNumber: config.rootCaSerialNumber
    };
  };

  // For callers that have already established their own authority and only need the certificate an agent's
  // HTTP clients must trust, such as handing it to the CLI as part of an agent gateway session.
  const getRootCaCertificateForOrg = async (orgId: string) => {
    const { rootCaCert } = await $getOrgRootCa(orgId);
    return rootCaCert.toString("pem");
  };

  const signIntermediate = async (actor: OrgServiceActor, publicKeyPem: string) => {
    await $checkLicense(actor.orgId);
    // Org membership alone is deliberately not enough here. This mints a keyCertSign intermediate off the
    // org root, which is a working MITM certificate for any host on every machine that trusts that root, so
    // it is restricted to principals that actually broker: a gateway serving a session, or a member on at
    // least one agent gateway's access list.
    await assertMayMintIntermediate(actor);

    const { rootCaCert, rootCaPrivateKeyBuffer } = await $getOrgRootCa(actor.orgId);

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
    // clamp so an intermediate can never outlive the root it chains to
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
    getRootCaCertificateForOrg,
    signIntermediate
  };
};
