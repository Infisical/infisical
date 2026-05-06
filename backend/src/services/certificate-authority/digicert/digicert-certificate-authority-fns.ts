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
import { getDigiCertApiBaseUrl } from "@app/services/app-connection/digicert/digicert-connection-fns";
import { TDigiCertConnection } from "@app/services/app-connection/digicert/digicert-connection-types";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  CrlReason,
  TAltNameType
} from "@app/services/certificate/certificate-types";
import {
  DigiCertExternalMetadataSchema,
  TDigiCertExternalMetadata
} from "@app/services/certificate-common/external-metadata-schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { extractDnParts, keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import { createDigiCertApiClient } from "./digicert-api-client";
import {
  TCreateDigiCertCertificateAuthorityDTO,
  TDigiCertCertificateAuthority,
  TDigiCertCertificateRequestMetadata,
  TUpdateDigiCertCertificateAuthorityDTO
} from "./digicert-certificate-authority-types";

type TDigiCertCertificateAuthorityFnsDeps = {
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

export const castDbEntryToDigiCertCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TDigiCertCertificateAuthority & { credentials: Buffer | null | undefined } => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed DigiCert certificate authority" });
  }

  if (!ca.externalCa.appConnectionId) {
    throw new BadRequestError({
      message: "DigiCert app connection ID is missing from certificate authority configuration"
    });
  }

  const config = (ca.externalCa.configuration ?? {}) as {
    organizationId?: number;
    productNameId?: string;
  };

  if (typeof config.organizationId !== "number" || !config.productNameId) {
    throw new BadRequestError({
      message: "DigiCert certificate authority configuration is missing organization ID or product"
    });
  }

  return {
    id: ca.id,
    type: CaType.DIGICERT,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    credentials: ca.externalCa.credentials,
    configuration: {
      appConnectionId: ca.externalCa.appConnectionId,
      organizationId: config.organizationId,
      productNameId: config.productNameId
    },
    status: ca.status as CaStatus
  };
};

const getDigiCertClientCredentials = async (
  appConnectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<{ apiKey: string; baseUrl: string }> => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `DigiCert app connection with ID '${appConnectionId}' not found` });
  }
  if (appConnection.app !== AppConnection.DigiCert) {
    throw new BadRequestError({ message: `App connection with ID '${appConnectionId}' is not a DigiCert connection` });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService
  })) as TDigiCertConnection["credentials"];

  return {
    apiKey: credentials.apiKey,
    baseUrl: getDigiCertApiBaseUrl(credentials.region)
  };
};

const PEM_CERTIFICATE_RE2 = new RE2("-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----", "g");

const TTL_RE2 = new RE2("^(\\d+)([dhm])$");
const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(TTL_RE2);
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }
  const [, value, unit] = match;
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) {
    throw new BadRequestError({ message: `Invalid TTL value: ${ttl}` });
  }
  switch (unit) {
    case "d":
      return num;
    case "h":
      return Math.max(1, Math.ceil(num / 24));
    case "m":
      return Math.max(1, Math.ceil(num / (24 * 60)));
    default:
      throw new BadRequestError({ message: `Invalid TTL unit: ${unit}` });
  }
};

const extractIssuedCertificateFields = (certObj: x509.X509Certificate) => {
  const subject = extractDnParts(certObj.subjectName);
  const commonName = subject.commonName ?? "";

  const sanExt = certObj.getExtension("2.5.29.17");
  const altNames: string[] = [];
  if (sanExt) {
    const sanNames = new x509.GeneralNames(sanExt.value);
    for (const item of sanNames.items) {
      if (
        item.type === TAltNameType.DNS ||
        item.type === TAltNameType.IP ||
        item.type === TAltNameType.EMAIL ||
        item.type === TAltNameType.URL
      ) {
        altNames.push(item.value);
      }
    }
  }

  const keyUsages: CertKeyUsage[] = [];
  const keyUsagesExt = certObj.getExtension(x509.KeyUsagesExtension);
  if (keyUsagesExt) {
    for (const keyUsage of Object.values(CertKeyUsage)) {
      // eslint-disable-next-line no-bitwise
      if ((x509.KeyUsageFlags[keyUsage] & keyUsagesExt.usages) !== 0) {
        keyUsages.push(keyUsage);
      }
    }
  }

  const extendedKeyUsages: CertExtendedKeyUsage[] = [];
  const ekuExt = certObj.getExtension(x509.ExtendedKeyUsageExtension);
  if (ekuExt) {
    for (const oid of ekuExt.usages) {
      const mapped = CertExtendedKeyUsageOIDToName[oid as string];
      if (mapped) extendedKeyUsages.push(mapped);
    }
  }

  return { commonName, altNames, keyUsages, extendedKeyUsages };
};

const extractLeafAndChain = (pemBundle: string): { leaf: string; chain: string } => {
  const matches = pemBundle.match(PEM_CERTIFICATE_RE2);
  if (!matches || matches.length === 0) {
    throw new BadRequestError({ message: "DigiCert returned an empty certificate bundle" });
  }

  if (matches.length < 2) {
    throw new BadRequestError({
      message: `DigiCert returned an incomplete certificate bundle (${matches.length} entry, expected leaf + chain)`
    });
  }

  let leafIndex = -1;
  matches.forEach((pem, index) => {
    if (leafIndex !== -1) return;
    try {
      const cert = new x509.X509Certificate(pem);
      const basicConstraints = cert.getExtension(x509.BasicConstraintsExtension);
      if (!basicConstraints?.ca) leafIndex = index;
    } catch {
      // skip unparseable entries
    }
  });

  if (leafIndex === -1) leafIndex = 0;

  const leaf = matches[leafIndex].trim();
  const chain = matches
    .filter((_, index) => index !== leafIndex)
    .map((cert) => cert.trim())
    .join("\n");
  return { leaf, chain };
};

export const DigiCertCertificateAuthorityFns = ({
  appConnectionDAL,
  appConnectionService,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL
}: TDigiCertCertificateAuthorityFnsDeps) => {
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
    configuration: TCreateDigiCertCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
  }) => {
    const { appConnectionId, organizationId, productNameId } = configuration;

    const appConnection = await appConnectionDAL.findById(appConnectionId);
    if (!appConnection) {
      throw new NotFoundError({ message: `DigiCert app connection with ID '${appConnectionId}' not found` });
    }
    if (appConnection.app !== AppConnection.DigiCert) {
      throw new BadRequestError({
        message: `App connection with ID '${appConnectionId}' is not a DigiCert connection`
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
            type: CaType.DIGICERT,
            configuration: {
              organizationId,
              productNameId
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

    return castDbEntryToDigiCertCertificateAuthority(caEntity);
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
    configuration?: TUpdateDigiCertCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
    name?: string;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { appConnectionId, organizationId, productNameId } = configuration;
        const appConnection = await appConnectionDAL.findById(appConnectionId);
        if (!appConnection) {
          throw new NotFoundError({ message: `DigiCert app connection with ID '${appConnectionId}' not found` });
        }
        if (appConnection.app !== AppConnection.DigiCert) {
          throw new BadRequestError({
            message: `App connection with ID '${appConnectionId}' is not a DigiCert connection`
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
            type: CaType.DIGICERT
          },
          {
            appConnectionId,
            configuration: {
              organizationId,
              productNameId
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

    return castDbEntryToDigiCertCertificateAuthority(updatedCa);
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
        [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.DIGICERT
      },
      {},
      permissionFilters
    );

    return cas.map(castDbEntryToDigiCertCertificateAuthority);
  };

  const orderCertificateFromProfile = async ({
    caId,
    commonName,
    altNames = [],
    signatureAlgorithm,
    keyAlgorithm = CertKeyAlgorithm.RSA_2048,
    csr,
    ttl,
    renewalOfOrderId
  }: {
    caId: string;
    commonName: string;
    altNames?: string[];
    signatureAlgorithm?: string;
    keyAlgorithm?: CertKeyAlgorithm;
    csr?: string;
    ttl: string;
    renewalOfOrderId?: number;
  }): Promise<{
    metadata: TDigiCertCertificateRequestMetadata;
    privateKey: string;
    immediateCertificateId?: number;
    orderId: number;
  }> => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.DIGICERT) {
      throw new BadRequestError({ message: "CA is not a DigiCert certificate authority" });
    }

    const digicertCa = castDbEntryToDigiCertCertificateAuthority(ca);
    if (digicertCa.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: `DigiCert CA is disabled [caId=${caId}]` });
    }

    const { productNameId } = digicertCa.configuration;

    const effectiveCommonName = commonName?.trim() || altNames.find((value) => value.trim().length > 0)?.trim() || "";
    if (!effectiveCommonName) {
      throw new BadRequestError({
        message: `DigiCert requires a common name or at least one DNS SAN [caId=${caId}]`
      });
    }

    let csrPem = csr?.trim();
    let privateKeyPem = "";

    if (!csrPem) {
      const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
      const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
      privateKeyPem = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

      const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
        name: `CN=${effectiveCommonName}`,
        keys: leafKeys,
        signingAlgorithm: alg,
        ...(altNames.length > 0 && {
          extensions: [
            new x509.SubjectAlternativeNameExtension(
              altNames.map((value) => ({ type: "dns" as TAltNameType, value })),
              false
            )
          ]
        })
      });
      csrPem = csrObj.toString("pem");
    }

    const { apiKey, baseUrl } = await getDigiCertClientCredentials(
      digicertCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    const client = createDigiCertApiClient(apiKey, baseUrl);

    const extraSans = altNames.filter((value) => value.toLowerCase() !== effectiveCommonName.toLowerCase());

    const normalizedSignature = signatureAlgorithm?.toLowerCase() ?? "";
    let signatureHash: "sha256" | "sha384" | "sha512" = "sha256";
    if (normalizedSignature.includes("sha512")) signatureHash = "sha512";
    else if (normalizedSignature.includes("sha384")) signatureHash = "sha384";

    const validityDays = parseTtlToDays(ttl);

    const baseOrderPayload = {
      certificate: {
        common_name: effectiveCommonName,
        ...(extraSans.length > 0 ? { dns_names: extraSans } : {}),
        csr: csrPem,
        signature_hash: signatureHash
      },
      organization: { id: digicertCa.configuration.organizationId },
      order_validity: { days: validityDays },
      dcv_method: "dns-txt-token" as const,
      skip_approval: true
    };

    const renewalIneligibleCodes = [
      "order_not_eligible_for_renewal",
      "order_not_renewable",
      "renewal_window_closed",
      "cannot_renew_expired_order",
      "product_not_eligible_for_renewal"
    ];
    let orderResponse: Awaited<ReturnType<typeof client.placeOrder>>;
    try {
      orderResponse = await client.placeOrder(productNameId, {
        ...baseOrderPayload,
        ...(renewalOfOrderId ? { renewal_of_order_id: renewalOfOrderId } : {})
      });
    } catch (err) {
      const message = (err as Error)?.message ?? "";
      const isRenewalIneligible =
        renewalOfOrderId !== undefined && renewalIneligibleCodes.some((code) => message.includes(code));
      if (isRenewalIneligible) {
        logger.warn(
          `DigiCert rejected renewal linkage (renewal_of_order_id=${renewalOfOrderId}) as not eligible; retrying as a fresh order [caId=${caId}]`
        );
        orderResponse = await client.placeOrder(productNameId, baseOrderPayload);
      } else {
        throw err;
      }
    }

    return {
      metadata: {
        digicert: {
          orderId: orderResponse.id,
          certificateId: orderResponse.certificate_id,
          productNameId,
          organizationId: digicertCa.configuration.organizationId,
          orderPlacedAt: new Date().toISOString()
        }
      },
      privateKey: privateKeyPem,
      immediateCertificateId: orderResponse.certificate_id,
      orderId: orderResponse.id
    };
  };

  const fetchAndAttachIssuedCertificate = async ({
    caId,
    certificateRequest,
    digicertCertificateId,
    digicertOrderId,
    encryptedPrivateKey,
    isRenewal,
    originalCertificateId
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
    digicertCertificateId: number;
    digicertOrderId: number;
    encryptedPrivateKey?: Buffer;
    isRenewal?: boolean;
    originalCertificateId?: string;
  }): Promise<{ certificateId: string; certificatePem: string }> => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.DIGICERT) {
      throw new BadRequestError({ message: "CA is not a DigiCert certificate authority" });
    }
    const digicertCa = castDbEntryToDigiCertCertificateAuthority(ca);

    const { apiKey, baseUrl } = await getDigiCertClientCredentials(
      digicertCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    const client = createDigiCertApiClient(apiKey, baseUrl);

    const pemBundle = await client.downloadCertificatePem(digicertCertificateId);
    const { leaf, chain } = extractLeafAndChain(pemBundle);

    const certObj = new x509.X509Certificate(leaf);
    const issued = extractIssuedCertificateFields(certObj);

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
            type: CaType.DIGICERT,
            orderId: digicertOrderId
          } satisfies TDigiCertExternalMetadata,
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
    if (!ca.externalCa || ca.externalCa.type !== CaType.DIGICERT) {
      throw new BadRequestError({ message: `CA is not a DigiCert certificate authority [caId=${caId}]` });
    }

    const cert = await certificateDAL.findOne({ caId, serialNumber });
    if (!cert) {
      throw new NotFoundError({
        message: `Certificate not found for revocation [caId=${caId}] [serialNumber=${serialNumber}]`
      });
    }
    const parsedMetadata = DigiCertExternalMetadataSchema.safeParse(cert.externalMetadata);
    if (!parsedMetadata.success) {
      throw new BadRequestError({
        message: `Certificate has no DigiCert order reference in externalMetadata — cannot revoke on DigiCert [certificateId=${cert.id}]`
      });
    }
    const { orderId } = parsedMetadata.data;

    const digicertCa = castDbEntryToDigiCertCertificateAuthority(ca);
    const { apiKey, baseUrl } = await getDigiCertClientCredentials(
      digicertCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    const client = createDigiCertApiClient(apiKey, baseUrl);

    try {
      await client.revokeOrder(orderId, `Revoked via Infisical — reason: ${reason}`);
    } catch (err) {
      const message = (err as Error)?.message ?? "";
      if (message.includes("order_already_revoked") || message.includes("order_is_revoked")) {
        logger.info(
          `DigiCert order already revoked upstream — treating as success [caId=${caId}] [certificateId=${cert.id}] [orderId=${orderId}]`
        );
      } else {
        throw err;
      }
    }

    logger.info(
      `DigiCert order revocation submitted [caId=${caId}] [certificateId=${cert.id}] [orderId=${orderId}] [reason=${reason}]`
    );
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderCertificateFromProfile,
    fetchAndAttachIssuedCertificate,
    revokeCertificate
  };
};

export type TDigiCertCertificateAuthorityFns = ReturnType<typeof DigiCertCertificateAuthorityFns>;
