import * as x509 from "@peculiar/x509";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  DIGICERT_CS_PRODUCT_NAME_IDS,
  isDigiCertOrgValidatedForProduct
} from "@app/services/app-connection/digicert/digicert-connection-fns";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TDigiCertExternalMetadata } from "@app/services/certificate-common/external-metadata-schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { extractIssuedCertificateFields } from "../certificate-authority-fns";
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
const MAX_CS_VALIDITY_DAYS = 459;

// server_platform.id=-1 ("Other") is DigiCert's value for the customer-supplied-CSR lane.
const CS_SERVER_PLATFORM_OTHER = -1;

// When a renewal_of_order_id link is rejected with one of these codes, retry as a fresh order.
const CS_RENEWAL_INELIGIBLE_CODES = ["order_not_eligible_for_renewal", "order_renewed_already"];

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
    const { digicertCa, client } = await loadDigiCertCsContext(caId, { requireCodeSigning: true });

    const targetOrder = await client.getOrder(previousOrderId);
    if (
      targetOrder.organization?.id !== digicertCa.configuration.organizationId ||
      targetOrder.product?.name_id !== digicertCa.configuration.productNameId
    ) {
      throw new BadRequestError({
        message: `DigiCert order ${previousOrderId} does not belong to this CA's organization/product and cannot be reissued here.`
      });
    }

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
    const { digicertCa, client } = await loadDigiCertCsContext(caId, { requireCodeSigning: true });
    const order = await client.getOrder(orderId);
    const sameOrg = order.organization?.id === digicertCa.configuration.organizationId;
    const sameProduct = order.product?.name_id === digicertCa.configuration.productNameId;
    if (!sameOrg || !sameProduct) {
      throw new BadRequestError({
        message:
          "That DigiCert order belongs to a different organization or product than this certificate authority and cannot be reused."
      });
    }
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

  const downloadCodeSigningCertificate = async ({
    caId,
    orderId,
    digicertCertificateId,
    keyAlgorithm,
    signatureAlgorithm,
    applicationId,
    profileId
  }: {
    caId: string;
    orderId: number;
    digicertCertificateId: number;
    keyAlgorithm?: string;
    signatureAlgorithm?: string;
    applicationId?: string | null;
    profileId?: string | null;
  }): Promise<{ certificateId: string; certificatePem: string }> => {
    const { ca, client } = await loadDigiCertCsContext(caId);
    const pemBundle = await client.downloadCertificatePem(digicertCertificateId);
    const { leaf, chain } = extractLeafAndChain(pemBundle);

    const certObj = new x509.X509Certificate(leaf);
    const issued = extractIssuedCertificateFields(certObj);

    const existingCert = await certificateDAL.findOne({ caId: ca.id, serialNumber: certObj.serialNumber });
    if (existingCert) {
      return { certificateId: existingCert.id, certificatePem: leaf };
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
          profileId: profileId ?? undefined,
          status: CertStatus.ACTIVE,
          friendlyName: issued.commonName || "",
          commonName: issued.commonName || "",
          altNames: issued.altNames.length > 0 ? issued.altNames.join(",") : "",
          serialNumber: certObj.serialNumber,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          keyUsages: issued.keyUsages,
          extendedKeyUsages: issued.extendedKeyUsages,
          keyAlgorithm: keyAlgorithm ?? undefined,
          signatureAlgorithm: signatureAlgorithm ?? undefined,
          projectId: ca.projectId,
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
    });

    return { certificateId: createdCertificateId, certificatePem: leaf };
  };

  return {
    assertCsOrgValidatedOrContactProvided,
    orderCodeSigningCertificate,
    reissueCodeSigningCertificate,
    findCodeSigningOrderByReference,
    assertCodeSigningOrderReusable,
    getCodeSigningOrderStatus,
    downloadCodeSigningCertificate
  };
};
