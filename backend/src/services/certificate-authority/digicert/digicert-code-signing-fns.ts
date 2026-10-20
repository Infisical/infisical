import * as x509 from "@peculiar/x509";
import { Knex } from "knex";

import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  DIGICERT_CS_PRODUCT_NAME_IDS,
  isDigiCertOrgValidatedForProduct
} from "@app/services/app-connection/digicert/digicert-connection-fns";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { extractExternallyIssuedCertificateFields } from "@app/services/certificate/certificate-fns";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TDigiCertExternalMetadata } from "@app/services/certificate-common/external-metadata-schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { createDigiCertApiClient } from "./digicert-api-client";
import { CodeSigningOrderStatus } from "./digicert-certificate-authority-enums";
import { DigiCertCaPurpose } from "./digicert-certificate-authority-schemas";
import {
  castDbEntryToDigiCertCertificateAuthority,
  extractLeafAndChain,
  getDigiCertClientCredentials
} from "./digicert-certificate-authority-shared";
import {
  TCodeSigningOrderInfo,
  TPlaceCodeSigningOrderRequest,
  TPlaceCodeSigningOrderResponse,
  TReissueCodeSigningOrderRequest
} from "./digicert-certificate-authority-types";

// DigiCert caps code signing order validity at 459 days (CA/Browser Forum ballot CSC-31 set a
// 460-day ceiling effective 2026-03-01; DigiCert's API enforces 459).
export const MAX_CS_VALIDITY_DAYS = 459;

// server_platform.id=-1 ("Other") is DigiCert's value for the customer-supplied-CSR lane.
const CS_SERVER_PLATFORM_OTHER = -1;

// When a renewal_of_order_id link is rejected with one of these codes, retry as a fresh order.
const CS_RENEWAL_INELIGIBLE_CODES = ["order_not_eligible_for_renewal", "order_renewed_already"];

export type TPreparedCodeSigningCertificate =
  | { certificatePem: string; existingCertificateId: string; insert: null }
  | {
      certificatePem: string;
      existingCertificateId: null;
      insert: (tx: Knex) => Promise<string>;
      findConcurrentInsert: () => Promise<string | null>;
    };

type TDigiCertCodeSigningFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction" | "updateById" | "findOne">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
};

export const digiCertCodeSigningFns = ({
  appConnectionDAL,
  certificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  kmsService,
  projectDAL
}: TDigiCertCodeSigningFnsDeps) => {
  const assertCsOrgValidatedOrContactProvided = async ({
    appConnectionId,
    organizationId,
    productNameId,
    verifiedContact
  }: {
    appConnectionId: string;
    organizationId: number;
    productNameId: string;
    verifiedContact?: unknown;
  }): Promise<void> => {
    if (verifiedContact) return;

    let isValidated = false;
    try {
      const { apiKey, baseUrl } = await getDigiCertClientCredentials(appConnectionId, appConnectionDAL, kmsService);
      const client = createDigiCertApiClient(apiKey, baseUrl);
      const { validations } = await client.getOrganizationValidations(organizationId);
      isValidated = isDigiCertOrgValidatedForProduct(validations, productNameId);
    } catch (err) {
      logger.warn(
        err,
        `DigiCert org validation pre-check failed [organizationId=${organizationId}] — allowing without a verified contact`
      );
      return;
    }

    if (!isValidated) {
      throw new BadRequestError({
        message:
          "This DigiCert organization has not completed code signing validation yet. Add a verified contact (first name, last name, email, job title, telephone) so DigiCert can start organization validation."
      });
    }
  };

  const normalizeCodeSigningStatus = (raw: string): CodeSigningOrderStatus => {
    const s = (raw || "").toLowerCase();
    switch (s) {
      case CodeSigningOrderStatus.Issued:
      case CodeSigningOrderStatus.Rejected:
      case CodeSigningOrderStatus.Canceled:
      case CodeSigningOrderStatus.Expired:
      case CodeSigningOrderStatus.Revoked:
      case CodeSigningOrderStatus.NeedsApproval:
      case CodeSigningOrderStatus.Processing:
      case CodeSigningOrderStatus.Pending:
        return s as CodeSigningOrderStatus;
      case "waiting_pickup":
      case "reissue_pending":
        return CodeSigningOrderStatus.Pending;
      default:
        logger.warn(`DigiCert returned unrecognized CS order status [status=${raw}] — treating as pending`);
        return CodeSigningOrderStatus.Pending;
    }
  };

  const loadDigiCertCsContext = async (caId: string, opts?: { requireCodeSigning?: boolean }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.DIGICERT) {
      throw new BadRequestError({ message: "CA is not a DigiCert certificate authority" });
    }
    const digicertCa = castDbEntryToDigiCertCertificateAuthority(ca);
    if (opts?.requireCodeSigning) {
      if (digicertCa.status !== CaStatus.ACTIVE) {
        throw new BadRequestError({ message: `DigiCert CA is disabled [caId=${caId}]` });
      }
      if (digicertCa.configuration.purpose !== DigiCertCaPurpose.CodeSigning) {
        throw new BadRequestError({
          message: `DigiCert CA '${digicertCa.name}' is configured for SSL, not code signing.`
        });
      }
      if (!DIGICERT_CS_PRODUCT_NAME_IDS.has(digicertCa.configuration.productNameId)) {
        throw new BadRequestError({
          message: `DigiCert CA points at product '${digicertCa.configuration.productNameId}' which is not a code-signing product.`
        });
      }
    }
    const { apiKey, baseUrl } = await getDigiCertClientCredentials(
      digicertCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    return { ca, digicertCa, client: createDigiCertApiClient(apiKey, baseUrl) };
  };

  const $getOwnedCodeSigningOrder = async (caId: string, orderId: number) => {
    const context = await loadDigiCertCsContext(caId, { requireCodeSigning: true });
    const order = await context.client.getOrder(orderId);
    if (
      order.organization?.id !== context.digicertCa.configuration.organizationId ||
      order.product?.name_id !== context.digicertCa.configuration.productNameId
    ) {
      throw new BadRequestError({
        message: `DigiCert order ${orderId} belongs to a different organization or product than this certificate authority.`
      });
    }
    return { ...context, order };
  };

  const orderCodeSigningCertificate = async ({
    caId,
    csr,
    commonName,
    signatureHash,
    ttlDays,
    renewalOfOrderId,
    alternativeOrderId,
    comments
  }: {
    caId: string;
    csr: string;
    commonName: string;
    signatureHash: "sha256" | "sha384" | "sha512";
    ttlDays: number;
    renewalOfOrderId?: number;
    alternativeOrderId?: string;
    comments?: string;
  }): Promise<{ orderId: number; certificateId: number | null }> => {
    if (ttlDays > MAX_CS_VALIDITY_DAYS) {
      throw new BadRequestError({
        message: `DigiCert code signing certificates are capped at ${MAX_CS_VALIDITY_DAYS} days of validity. Reduce the signer's validity period.`
      });
    }

    const { digicertCa, client } = await loadDigiCertCsContext(caId, { requireCodeSigning: true });
    const { productNameId } = digicertCa.configuration;

    const { verifiedContact } = digicertCa.configuration;
    const payload: TPlaceCodeSigningOrderRequest = {
      certificate: {
        common_name: commonName,
        csr,
        signature_hash: signatureHash,
        server_platform: { id: CS_SERVER_PLATFORM_OTHER }
      },
      organization: {
        id: digicertCa.configuration.organizationId,
        ...(verifiedContact
          ? {
              contacts: [
                {
                  contact_type: "verified_contact" as const,
                  first_name: verifiedContact.firstName,
                  last_name: verifiedContact.lastName,
                  email: verifiedContact.email,
                  job_title: verifiedContact.jobTitle,
                  telephone: verifiedContact.telephone
                }
              ]
            }
          : {})
      },
      order_validity: { days: ttlDays },
      cs_provisioning_method: "email",
      skip_approval: true,
      ...(alternativeOrderId ? { alternative_order_id: alternativeOrderId } : {}),
      ...(comments ? { comments } : {})
    };

    let resp: TPlaceCodeSigningOrderResponse;
    try {
      resp = await client.placeOrder<TPlaceCodeSigningOrderResponse>(productNameId, {
        ...payload,
        ...(renewalOfOrderId ? { renewal_of_order_id: renewalOfOrderId } : {})
      });
    } catch (err) {
      const message = (err as Error)?.message ?? "";
      const isRenewalIneligible =
        renewalOfOrderId !== undefined && CS_RENEWAL_INELIGIBLE_CODES.some((code) => message.includes(code));
      if (!isRenewalIneligible) throw err;
      logger.warn(
        `DigiCert rejected CS renewal linkage (renewal_of_order_id=${renewalOfOrderId}) as not eligible; retrying as a fresh order [caId=${caId}]`
      );
      resp = await client.placeOrder<TPlaceCodeSigningOrderResponse>(productNameId, payload);
    }
    return { orderId: resp.id, certificateId: resp.certificate_id ?? null };
  };

  const reissueCodeSigningCertificate = async ({
    caId,
    previousOrderId,
    csr,
    signatureHash,
    comments
  }: {
    caId: string;
    previousOrderId: number;
    csr: string;
    signatureHash: "sha256" | "sha384" | "sha512";
    comments?: string;
  }): Promise<{ orderId: number; certificateId: number | null }> => {
    const { client } = await $getOwnedCodeSigningOrder(caId, previousOrderId);

    const reissuePayload: TReissueCodeSigningOrderRequest = {
      certificate: {
        csr,
        signature_hash: signatureHash,
        server_platform: { id: CS_SERVER_PLATFORM_OTHER }
      },
      cs_provisioning_method: "email",
      skip_approval: true,
      ...(comments ? { comments } : {})
    };

    const resp = await client.reissueOrder<TPlaceCodeSigningOrderResponse>(previousOrderId, reissuePayload);
    return { orderId: resp.id ?? previousOrderId, certificateId: resp.certificate_id ?? null };
  };

  const findCodeSigningOrderByReference = async (
    caId: string,
    reference: string
  ): Promise<{ orderId: number; certificateId: number | null } | null> => {
    const { client } = await loadDigiCertCsContext(caId, { requireCodeSigning: true });
    const { orders } = await client.getOrdersByAlternativeId(reference);
    const match = (orders ?? [])[0];
    return match ? { orderId: match.order_id, certificateId: match.certificate_id ?? null } : null;
  };

  const assertCodeSigningOrderReusable = async (caId: string, orderId: number): Promise<void> => {
    await $getOwnedCodeSigningOrder(caId, orderId);
  };

  const getCodeSigningOrderStatus = async (caId: string, orderId: number): Promise<TCodeSigningOrderInfo> => {
    const { client } = await loadDigiCertCsContext(caId);
    const order = await client.getOrder(orderId);
    return {
      id: orderId,
      status: normalizeCodeSigningStatus(order.status),
      certificateId: order.certificate?.id ?? null,
      rawStatus: order.status
    };
  };

  const fetchIssuedCodeSigningCertificate = async (
    caId: string,
    orderId: number
  ): Promise<{ pemBundle: string; certificate: x509.X509Certificate }> => {
    const { client, order } = await $getOwnedCodeSigningOrder(caId, orderId);
    if (normalizeCodeSigningStatus(order.status) !== CodeSigningOrderStatus.Issued || !order.certificate?.id) {
      throw new BadRequestError({
        message: `DigiCert order ${orderId} has no issued certificate to use (order status: '${order.status}').`
      });
    }

    const pemBundle = await client.downloadCertificatePem(order.certificate.id);
    const certificate = new x509.X509Certificate(extractLeafAndChain(pemBundle).leaf);
    if (certificate.notAfter < new Date()) {
      throw new BadRequestError({
        message: `The certificate in DigiCert order ${orderId} expired on ${certificate.notAfter.toISOString()}.`
      });
    }
    const eku = certificate.getExtension(x509.ExtendedKeyUsageExtension);
    if (!eku?.usages.some((usage) => usage === x509.ExtendedKeyUsage.codeSigning)) {
      throw new BadRequestError({
        message: `The certificate in DigiCert order ${orderId} does not have the code signing extended key usage.`
      });
    }
    return { pemBundle, certificate };
  };

  const prepareCodeSigningCertificateImport = async ({
    caId,
    orderId,
    digicertCertificateId,
    keyAlgorithm,
    signatureAlgorithm,
    applicationId,
    profileId,
    pemBundle: providedPemBundle
  }: {
    caId: string;
    orderId: number;
    digicertCertificateId?: number;
    pemBundle?: string;
    keyAlgorithm?: string;
    signatureAlgorithm?: string;
    applicationId?: string | null;
    profileId?: string | null;
  }): Promise<TPreparedCodeSigningCertificate> => {
    const { ca, client } = await loadDigiCertCsContext(caId);
    if (!providedPemBundle && !digicertCertificateId) {
      throw new BadRequestError({ message: `DigiCert order ${orderId} has no certificate to download.` });
    }
    const pemBundle = providedPemBundle ?? (await client.downloadCertificatePem(digicertCertificateId as number));
    const { leaf, chain } = extractLeafAndChain(pemBundle);

    const certObj = new x509.X509Certificate(leaf);
    const parsedFields = extractExternallyIssuedCertificateFields(certObj);
    const differentCaError = new BadRequestError({
      message: `The certificate in DigiCert order ${orderId} is already in Certificate Manager under a different certificate authority. Remove that copy from the certificate inventory, then try again.`
    });

    const existingCert = await certificateDAL.findOne({ serialNumber: certObj.serialNumber });
    if (existingCert) {
      if (existingCert.caId !== ca.id) throw differentCaError;
      return { certificatePem: leaf, existingCertificateId: existingCert.id, insert: null };
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

    const insert = async (tx: Knex) => {
      const cert = await certificateDAL.create(
        {
          ...parsedFields,
          caId: ca.id,
          applicationId: applicationId ?? undefined,
          profileId: profileId ?? undefined,
          status: CertStatus.ACTIVE,
          projectId: ca.projectId,
          friendlyName: parsedFields.commonName || "",
          commonName: parsedFields.commonName || "",
          keyUsages: parsedFields.keyUsages ?? [],
          extendedKeyUsages: parsedFields.extendedKeyUsages ?? [],
          keyAlgorithm: parsedFields.keyAlgorithm ?? keyAlgorithm,
          signatureAlgorithm: parsedFields.signatureAlgorithm ?? signatureAlgorithm,
          externalMetadata: {
            type: CaType.DIGICERT,
            orderId
          } satisfies TDigiCertExternalMetadata
        },
        tx
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      return cert.id;
    };

    return {
      certificatePem: leaf,
      existingCertificateId: null,
      insert,
      findConcurrentInsert: async () => {
        const concurrentCert = await certificateDAL.transaction((tx) =>
          certificateDAL.findOne({ serialNumber: certObj.serialNumber }, tx)
        );
        if (concurrentCert && concurrentCert.caId !== ca.id) throw differentCaError;
        return concurrentCert?.id ?? null;
      }
    };
  };

  const downloadCodeSigningCertificate = async (
    args: Parameters<typeof prepareCodeSigningCertificateImport>[0]
  ): Promise<{ certificateId: string; certificatePem: string }> => {
    const prepared = await prepareCodeSigningCertificateImport(args);
    if (!prepared.insert) {
      return { certificateId: prepared.existingCertificateId, certificatePem: prepared.certificatePem };
    }
    const { insert, findConcurrentInsert } = prepared;

    const createdCertificateId = await certificateDAL.transaction(insert).catch(async (error: unknown) => {
      if ((error as { error?: { code?: string } })?.error?.code === DatabaseErrorCode.UniqueViolation) {
        const concurrentCertificateId = await findConcurrentInsert();
        if (concurrentCertificateId) return concurrentCertificateId;
      }
      throw error;
    });

    return { certificateId: createdCertificateId, certificatePem: prepared.certificatePem };
  };

  return {
    assertCsOrgValidatedOrContactProvided,
    orderCodeSigningCertificate,
    reissueCodeSigningCertificate,
    findCodeSigningOrderByReference,
    assertCodeSigningOrderReusable,
    getCodeSigningOrderStatus,
    fetchIssuedCodeSigningCertificate,
    prepareCodeSigningCertificateImport,
    downloadCodeSigningCertificate
  };
};
