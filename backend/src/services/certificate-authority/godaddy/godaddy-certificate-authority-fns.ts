/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TableName } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ProcessedPermissionRules } from "@app/lib/knex/permission-filter-utils";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { buildGoDaddySsoKeyHeader } from "@app/services/app-connection/godaddy/godaddy-connection-constants";
import { getGoDaddyApiBaseUrl } from "@app/services/app-connection/godaddy/godaddy-connection-fns";
import { TGoDaddyConnection } from "@app/services/app-connection/godaddy/godaddy-connection-types";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { CertKeyAlgorithm, CertStatus, CrlReason } from "@app/services/certificate/certificate-types";
import {
  GoDaddyExternalMetadataSchema,
  TGoDaddyExternalMetadata
} from "@app/services/certificate-common/external-metadata-schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { extractIssuedCertificateFields, keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import { createGoDaddyApiClient } from "./godaddy-api-client";
import { GoDaddyProductType } from "./godaddy-certificate-authority-enums";
import {
  TCreateGoDaddyCertificateAuthorityDTO,
  TGoDaddyCertificateAuthority,
  TGoDaddyCertificateRequestMetadata,
  TUpdateGoDaddyCertificateAuthorityDTO
} from "./godaddy-certificate-authority-types";
import { isGoDaddyCoveredSan, validateGoDaddyIssuanceInputs } from "./godaddy-certificate-authority-validators";

type TGoDaddyCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById" | "findWithAssociatedCa" | "findById"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction" | "updateById" | "findOne">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
};

// GoDaddy renewal reuses the same certificate id and only issues a genuinely renewed certificate
// (new serial) near expiry; until then GET/download return the still-current certificate. This signals
// that case so the poller keeps the request pending instead of trying to attach a duplicate serial.
export class GoDaddyRenewalNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoDaddyRenewalNotReadyError";
  }
}

const GODADDY_ROOT_TYPE = "GODADDY_SHA_2";

// GoDaddy revoke reasons accepted by POST /v1/certificates/{id}/revoke
const mapCrlReasonToGoDaddyReason = (reason: CrlReason): string => {
  switch (reason) {
    case CrlReason.KEY_COMPROMISE:
      return "KEY_COMPROMISE";
    case CrlReason.AFFILIATION_CHANGED:
      return "AFFILIATION_CHANGED";
    case CrlReason.SUPERSEDED:
      return "SUPERSEDED";
    case CrlReason.CESSATION_OF_OPERATION:
      return "CESSATION_OF_OPERATION";
    case CrlReason.PRIVILEGE_WITHDRAWN:
      return "PRIVILEGE_WITHDRAWN";
    default:
      return "CESSATION_OF_OPERATION";
  }
};

const TTL_DAYS_PER_YEAR = 365;
const TTL_RE2 = new RE2("^(\\d+)([dhmy])$");
const parseTtlToYears = (ttl: string): number => {
  const match = ttl.match(TTL_RE2);
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }
  const [, value, unit] = match;
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) {
    throw new BadRequestError({ message: `Invalid TTL value: ${ttl}` });
  }
  let days: number;
  switch (unit) {
    case "y":
      days = num * TTL_DAYS_PER_YEAR;
      break;
    case "d":
      days = num;
      break;
    case "h":
      days = num / 24;
      break;
    case "m":
      days = num / (24 * 60);
      break;
    default:
      throw new BadRequestError({ message: `Invalid TTL unit: ${unit}` });
  }
  return Math.max(1, Math.ceil(days / TTL_DAYS_PER_YEAR));
};

export const castDbEntryToGoDaddyCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TGoDaddyCertificateAuthority & { credentials: Buffer | null | undefined } => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed GoDaddy certificate authority" });
  }

  if (!ca.externalCa.appConnectionId) {
    throw new BadRequestError({
      message: "GoDaddy app connection ID is missing from certificate authority configuration"
    });
  }

  const config = (ca.externalCa.configuration ?? {}) as {
    productType?: GoDaddyProductType;
  };

  if (!config.productType) {
    throw new BadRequestError({
      message: "GoDaddy certificate authority configuration is missing the product type"
    });
  }

  return {
    id: ca.id,
    type: CaType.GODADDY,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    credentials: ca.externalCa.credentials,
    configuration: {
      appConnectionId: ca.externalCa.appConnectionId,
      productType: config.productType
    },
    status: ca.status as CaStatus
  };
};

export const getGoDaddyClientCredentials = async (
  appConnectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<{ authHeader: string; baseUrl: string }> => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `GoDaddy app connection with ID '${appConnectionId}' not found` });
  }
  if (appConnection.app !== AppConnection.GoDaddy) {
    throw new BadRequestError({ message: `App connection with ID '${appConnectionId}' is not a GoDaddy connection` });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService
  })) as TGoDaddyConnection["credentials"];

  return {
    authHeader: buildGoDaddySsoKeyHeader(credentials.apiKey, credentials.apiSecret),
    baseUrl: getGoDaddyApiBaseUrl()
  };
};

export const GoDaddyCertificateAuthorityFns = ({
  appConnectionDAL,
  appConnectionService,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL
}: TGoDaddyCertificateAuthorityFnsDeps) => {
  const createCertificateAuthority = async ({
    name,
    projectId,
    configuration,
    actor,
    status
  }: {
    status: CaStatus;
    name: string;
    projectId: string;
    configuration: TCreateGoDaddyCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
  }) => {
    const { appConnectionId, productType } = configuration;

    const appConnection = await appConnectionDAL.findById(appConnectionId);
    if (!appConnection) {
      throw new NotFoundError({ message: `GoDaddy app connection with ID '${appConnectionId}' not found` });
    }
    if (appConnection.app !== AppConnection.GoDaddy) {
      throw new BadRequestError({
        message: `App connection with ID '${appConnectionId}' is not a GoDaddy connection`
      });
    }

    await appConnectionService.validateAppConnectionUsageById(
      appConnection.app as AppConnection,
      { connectionId: appConnectionId, projectId },
      actor
    );

    const caEntity = await certificateAuthorityDAL.transaction(async (tx) => {
      try {
        const ca = await certificateAuthorityDAL.create(
          {
            projectId,
            enableDirectIssuance: false,
            name,
            status
          },
          tx
        );

        await externalCertificateAuthorityDAL.create(
          {
            caId: ca.id,
            appConnectionId,
            type: CaType.GODADDY,
            configuration: {
              productType
            }
          },
          tx
        );

        return await certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
      } catch (error) {
        // 23505 = unique_violation — same CA name in the same project
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        if ((error as any)?.error?.code === "23505") {
          throw new BadRequestError({
            message: "Certificate authority with the same name already exists in your project"
          });
        }
        throw error;
      }
    });

    if (!caEntity.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to create external certificate authority" });
    }

    return castDbEntryToGoDaddyCertificateAuthority(caEntity);
  };

  const updateCertificateAuthority = async ({
    id,
    status,
    configuration,
    actor,
    name
  }: {
    id: string;
    status?: CaStatus;
    configuration?: TUpdateGoDaddyCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
    name?: string;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { appConnectionId, productType } = configuration;
        const appConnection = await appConnectionDAL.findById(appConnectionId);
        if (!appConnection) {
          throw new NotFoundError({ message: `GoDaddy app connection with ID '${appConnectionId}' not found` });
        }
        if (appConnection.app !== AppConnection.GoDaddy) {
          throw new BadRequestError({
            message: `App connection with ID '${appConnectionId}' is not a GoDaddy connection`
          });
        }

        const ca = await certificateAuthorityDAL.findById(id);
        if (!ca) {
          throw new NotFoundError({ message: `Could not find Certificate Authority with ID "${id}"` });
        }

        await appConnectionService.validateAppConnectionUsageById(
          appConnection.app as AppConnection,
          { connectionId: appConnectionId, projectId: ca.projectId },
          actor
        );

        await externalCertificateAuthorityDAL.update(
          {
            caId: id,
            type: CaType.GODADDY
          },
          {
            appConnectionId,
            configuration: {
              productType
            }
          },
          tx
        );
      }

      if (name || status) {
        await certificateAuthorityDAL.updateById(id, { name, status }, tx);
      }

      return certificateAuthorityDAL.findByIdWithAssociatedCa(id, tx);
    });

    if (!updatedCa.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to update external certificate authority" });
    }

    return castDbEntryToGoDaddyCertificateAuthority(updatedCa);
  };

  const listCertificateAuthorities = async ({
    projectId,
    permissionFilters
  }: {
    projectId: string;
    permissionFilters?: ProcessedPermissionRules;
  }) => {
    const cas = await certificateAuthorityDAL.findWithAssociatedCa(
      {
        [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
        [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.GODADDY
      },
      {},
      permissionFilters
    );

    return cas.map(castDbEntryToGoDaddyCertificateAuthority);
  };

  const orderCertificate = async ({
    caId,
    commonName,
    altNames = [],
    keyAlgorithm = CertKeyAlgorithm.RSA_2048,
    csr,
    ttl,
    renewalOfCertificateId
  }: {
    caId: string;
    commonName: string;
    altNames?: string[];
    signatureAlgorithm?: string;
    keyAlgorithm?: CertKeyAlgorithm;
    csr?: string;
    ttl: string;
    renewalOfCertificateId?: string;
  }): Promise<{
    metadata: TGoDaddyCertificateRequestMetadata;
    privateKey: string;
    certificateId: string;
  }> => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.GODADDY) {
      throw new BadRequestError({ message: "CA is not a GoDaddy certificate authority" });
    }

    const godaddyCa = castDbEntryToGoDaddyCertificateAuthority(ca);
    if (godaddyCa.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: `GoDaddy CA is disabled [caId=${caId}]` });
    }

    validateGoDaddyIssuanceInputs({ keyAlgorithm });

    const { productType } = godaddyCa.configuration;

    const effectiveCommonName = commonName?.trim() || altNames.find((value) => value.trim().length > 0)?.trim() || "";
    if (!effectiveCommonName) {
      throw new BadRequestError({
        message: `GoDaddy requires a common name or at least one DNS SAN [caId=${caId}]`
      });
    }

    // GoDaddy DV products cover the common name and its `www.` host (GoDaddy adds the www SAN itself);
    // any other domain isn't supported. Callers validate this earlier — guard here too so we never
    // silently issue against an unexpected domain.
    const extraSans = altNames.filter((value) => !isGoDaddyCoveredSan(value, effectiveCommonName));
    if (extraSans.length > 0) {
      throw new BadRequestError({
        message:
          "GoDaddy DV certificates cover only the common name and its www subdomain; additional domains aren't supported"
      });
    }

    let csrPem = csr?.trim();
    let privateKeyPem = "";

    if (!csrPem) {
      const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
      const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
      privateKeyPem = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

      // CN only: GoDaddy DV coverage is product-driven (CN + auto-added www), so we don't put SANs in
      // the CSR. This matches the original order and keeps renewals (which reconstruct the issued
      // cert's www SAN) from sending a CSR GoDaddy didn't get on first issuance.
      const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
        name: `CN=${effectiveCommonName}`,
        keys: leafKeys,
        signingAlgorithm: alg
      });
      csrPem = csrObj.toString("pem");
    }

    const { authHeader, baseUrl } = await getGoDaddyClientCredentials(
      godaddyCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    const client = createGoDaddyApiClient(authHeader, baseUrl);

    const period = parseTtlToYears(ttl);

    let certificateId: string;
    if (renewalOfCertificateId) {
      // Renewal reuses the existing GoDaddy certificate id; we still generate a fresh CSR/key so the
      // renewed certificate is re-keyed and we capture its private key locally.
      await client.renewCertificate(renewalOfCertificateId, {
        commonName: effectiveCommonName,
        csr: csrPem,
        period,
        rootType: GODADDY_ROOT_TYPE
      });
      certificateId = renewalOfCertificateId;
    } else {
      const orderResponse = await client.createCertificate({
        commonName: effectiveCommonName,
        csr: csrPem,
        period,
        productType,
        rootType: GODADDY_ROOT_TYPE
      });
      certificateId = orderResponse.certificateId;
    }

    return {
      metadata: {
        godaddy: {
          certificateId,
          productType,
          orderPlacedAt: new Date().toISOString()
        }
      },
      privateKey: privateKeyPem,
      certificateId
    };
  };

  const fetchAndAttachIssuedCertificate = async ({
    caId,
    certificateRequest,
    godaddyCertificateId,
    encryptedPrivateKey,
    isRenewal,
    originalCertificateId,
    applicationId
  }: {
    caId: string;
    certificateRequest: {
      id: string;
      profileId?: string | null;
      commonName?: string | null;
      altNames?: string | null;
      keyUsages?: string[] | null;
      extendedKeyUsages?: string[] | null;
      keyAlgorithm?: string | null;
      signatureAlgorithm?: string | null;
    };
    godaddyCertificateId: string;
    encryptedPrivateKey?: Buffer;
    isRenewal?: boolean;
    originalCertificateId?: string;
    applicationId?: string | null;
  }): Promise<{ certificateId: string; certificatePem: string }> => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.GODADDY) {
      throw new BadRequestError({ message: "CA is not a GoDaddy certificate authority" });
    }
    const godaddyCa = castDbEntryToGoDaddyCertificateAuthority(ca);

    const { authHeader, baseUrl } = await getGoDaddyClientCredentials(
      godaddyCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    const client = createGoDaddyApiClient(authHeader, baseUrl);

    const bundle = await client.downloadCertificate(godaddyCertificateId);
    const leaf = bundle.pems.certificate?.trim();
    if (!leaf) {
      throw new BadRequestError({ message: "GoDaddy returned an empty certificate bundle" });
    }
    const chain = [bundle.pems.intermediate, bundle.pems.cross, bundle.pems.root]
      .map((pem) => pem?.trim())
      .filter((pem): pem is string => Boolean(pem))
      .join("\n");

    const certObj = new x509.X509Certificate(leaf);
    const issued = extractIssuedCertificateFields(certObj);

    if (isRenewal && originalCertificateId) {
      const original = await certificateDAL.findOne({ id: originalCertificateId });
      if (original?.serialNumber && original.serialNumber === certObj.serialNumber) {
        throw new GoDaddyRenewalNotReadyError(
          `GoDaddy has not issued a renewed certificate yet — still serving serial ${certObj.serialNumber} [originalCertificateId=${originalCertificateId}]`
        );
      }
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });
    const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });
    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(chain)
    });

    const createdCertificateId = await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          applicationId: applicationId ?? undefined,
          profileId: certificateRequest.profileId ?? undefined,
          status: CertStatus.ACTIVE,
          friendlyName: issued.commonName || "",
          commonName: issued.commonName || "",
          altNames: issued.altNames.length > 0 ? issued.altNames.join(",") : "",
          serialNumber: certObj.serialNumber,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          keyUsages: issued.keyUsages,
          extendedKeyUsages: issued.extendedKeyUsages,
          keyAlgorithm: certificateRequest.keyAlgorithm ?? undefined,
          signatureAlgorithm: certificateRequest.signatureAlgorithm ?? undefined,
          projectId: ca.projectId,
          externalMetadata: {
            type: CaType.GODADDY,
            certificateId: godaddyCertificateId
          } satisfies TGoDaddyExternalMetadata,
          renewedFromCertificateId: isRenewal && originalCertificateId ? originalCertificateId : null
        },
        tx
      );

      if (isRenewal && originalCertificateId) {
        await certificateDAL.updateById(originalCertificateId, { renewedByCertificateId: cert.id }, tx);
      }

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      if (encryptedPrivateKey) {
        await certificateSecretDAL.create(
          {
            certId: cert.id,
            encryptedPrivateKey
          },
          tx
        );
      }

      return cert.id;
    });

    return { certificateId: createdCertificateId, certificatePem: leaf };
  };

  const revokeCertificate = async ({
    caId,
    serialNumber,
    reason
  }: {
    caId: string;
    serialNumber: string;
    reason: CrlReason;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.GODADDY) {
      throw new BadRequestError({ message: `CA is not a GoDaddy certificate authority [caId=${caId}]` });
    }

    const cert = await certificateDAL.findOne({ caId, serialNumber });
    if (!cert) {
      throw new NotFoundError({
        message: `Certificate not found for revocation [caId=${caId}] [serialNumber=${serialNumber}]`
      });
    }
    const parsedMetadata = GoDaddyExternalMetadataSchema.safeParse(cert.externalMetadata);
    if (!parsedMetadata.success) {
      throw new BadRequestError({
        message: `Certificate has no GoDaddy reference in externalMetadata — cannot revoke on GoDaddy [certificateId=${cert.id}]`
      });
    }
    const { certificateId } = parsedMetadata.data;

    const godaddyCa = castDbEntryToGoDaddyCertificateAuthority(ca);
    const { authHeader, baseUrl } = await getGoDaddyClientCredentials(
      godaddyCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    const client = createGoDaddyApiClient(authHeader, baseUrl);

    await client.revokeCertificate(certificateId, mapCrlReasonToGoDaddyReason(reason));

    logger.info(
      `GoDaddy certificate revocation submitted [caId=${caId}] [certificateId=${cert.id}] [godaddyCertificateId=${certificateId}] [reason=${reason}]`
    );
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderCertificate,
    fetchAndAttachIssuedCertificate,
    revokeCertificate
  };
};

export type TGoDaddyCertificateAuthorityFns = ReturnType<typeof GoDaddyCertificateAuthorityFns>;
