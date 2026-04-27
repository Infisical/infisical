import { TCertificateRequests } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { getDigiCertApiBaseUrl } from "@app/services/app-connection/digicert/digicert-connection-fns";
import { TDigiCertConnection } from "@app/services/app-connection/digicert/digicert-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { CertificateRequestStatus } from "../../certificate-common/certificate-constants";
import { TCertificateRequestDALFactory } from "../../certificate-request/certificate-request-dal";
import {
  TAttachCertificateToRequestDTO,
  TUpdateCertificateRequestStatusDTO
} from "../../certificate-request/certificate-request-types";
import { TResourceMetadataDALFactory } from "../../resource-metadata/resource-metadata-dal";
import { copyMetadataFromRequestToCertificate } from "../../resource-metadata/resource-metadata-fns";
import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { createDigiCertApiClient, TDigiCertApiClient } from "./digicert-api-client";
import {
  DIGICERT_FINAL_ISSUED_STATUSES,
  DigiCertOrderStatus,
  DigiCertProcessorOutcome
} from "./digicert-certificate-authority-enums";
import {
  castDbEntryToDigiCertCertificateAuthority,
  TDigiCertCertificateAuthorityFns
} from "./digicert-certificate-authority-fns";
import { DigiCertCertificateRequestMetadataSchema } from "./digicert-certificate-authority-schemas";

export type TDigiCertCertificateRequestServiceDep = {
  updateCertificateRequestStatus: (args: TUpdateCertificateRequestStatusDTO) => Promise<unknown>;
  attachCertificateToRequest: (args: TAttachCertificateToRequestDTO) => Promise<unknown>;
};

export const DIGICERT_VALIDATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export type TDigiCertOrderMetadata = {
  digicert: {
    orderId: number;
    certificateId?: number;
    productNameId: string;
    organizationId: number;
    orderPlacedAt: string;
    lastCheckedAt?: string;
    lastCheckStatus?: string;
    isRenewal?: boolean;
    originalCertificateId?: string;
  };
};

export type TProcessDigiCertRequestDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById">;
  certificateRequestService: TDigiCertCertificateRequestServiceDep;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany">;
  digicertFns: Pick<TDigiCertCertificateAuthorityFns, "fetchAndAttachIssuedCertificate">;
};

export type TProcessDigiCertRequestResult =
  | { status: CertificateRequestStatus.ISSUED; certificateId: string; orderStatus: string }
  | { status: CertificateRequestStatus.FAILED; orderStatus: string; reason: string }
  | { status: CertificateRequestStatus.PENDING_VALIDATION; orderStatus: string }
  | { status: DigiCertProcessorOutcome.Skipped; reason: string };

const getOrCreateClient = async (
  request: TCertificateRequests,
  deps: Pick<TProcessDigiCertRequestDeps, "certificateAuthorityDAL" | "appConnectionDAL" | "kmsService">,
  clientCache?: Map<string, TDigiCertApiClient>
): Promise<TDigiCertApiClient> => {
  if (!request.caId) {
    throw new Error(`certificate request is missing caId [certificateRequestId=${request.id}]`);
  }
  const cached = clientCache?.get(request.caId);
  if (cached) return cached;

  const ca = await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(request.caId);
  const digicertCa = castDbEntryToDigiCertCertificateAuthority(ca);
  const appConnection = await deps.appConnectionDAL.findById(digicertCa.configuration.appConnectionId);
  if (!appConnection || appConnection.app !== AppConnection.DigiCert) {
    throw new Error(
      `DigiCert app connection missing or invalid [certificateRequestId=${request.id}] [caId=${request.caId}]`
    );
  }
  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService: deps.kmsService
  })) as TDigiCertConnection["credentials"];

  const client = createDigiCertApiClient(credentials.apiKey, getDigiCertApiBaseUrl(credentials.region));
  clientCache?.set(request.caId, client);
  return client;
};

export const processDigiCertPendingValidationRequest = async (
  deps: TProcessDigiCertRequestDeps,
  request: TCertificateRequests,
  clientCache?: Map<string, TDigiCertApiClient>
): Promise<TProcessDigiCertRequestResult> => {
  if (!request.caId || !request.metadata) {
    return { status: DigiCertProcessorOutcome.Skipped, reason: "missing caId or metadata" };
  }

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(request.metadata);
  } catch {
    logger.warn(`DigiCert request metadata could not be parsed [certificateRequestId=${request.id}]`);
    return { status: DigiCertProcessorOutcome.Skipped, reason: "unparseable metadata" };
  }

  const parseResult = DigiCertCertificateRequestMetadataSchema.safeParse(rawMetadata);
  if (!parseResult.success) {
    logger.warn(
      { err: parseResult.error },
      `DigiCert request metadata failed schema validation [certificateRequestId=${request.id}]`
    );
    return { status: DigiCertProcessorOutcome.Skipped, reason: "metadata did not match schema" };
  }
  const parsed = parseResult.data as TDigiCertOrderMetadata;

  const age = Date.now() - new Date(parsed.digicert.orderPlacedAt).getTime();
  if (age >= DIGICERT_VALIDATION_TIMEOUT_MS) {
    await deps.certificateRequestService.updateCertificateRequestStatus({
      certificateRequestId: request.id,
      status: CertificateRequestStatus.FAILED,
      errorMessage: "Validation timed out after 24h"
    });
    logger.info(`DigiCert validation timed out [certificateRequestId=${request.id}]`);
    return { status: CertificateRequestStatus.FAILED, orderStatus: "timeout", reason: "timeout" };
  }

  const client = await getOrCreateClient(request, deps, clientCache);

  const orderInfo = await client.getOrder(parsed.digicert.orderId);
  let orderStatus = orderInfo.status?.toLowerCase() ?? "unknown";
  let newCertificateId = orderInfo.certificate?.id ?? parsed.digicert.certificateId;
  let lastCheckStatus: string | undefined;

  if (orderStatus === DigiCertOrderStatus.Pending) {
    const checkResult = await client.checkValidation(parsed.digicert.orderId);
    orderStatus = checkResult.order_status?.toLowerCase() ?? orderStatus;
    newCertificateId = checkResult.certificate_id ?? newCertificateId;
    lastCheckStatus = checkResult.dcv_status ?? orderStatus;
  }

  const isFinalisable = DIGICERT_FINAL_ISSUED_STATUSES.some((status) => status === orderStatus);
  if (isFinalisable && newCertificateId) {
    const { certificateId } = await deps.digicertFns.fetchAndAttachIssuedCertificate({
      caId: request.caId,
      certificateRequest: {
        id: request.id,
        profileId: request.profileId,
        commonName: request.commonName,
        altNames: (request.altNames as string | null) ?? null,
        keyUsages: request.keyUsages,
        extendedKeyUsages: request.extendedKeyUsages,
        keyAlgorithm: request.keyAlgorithm,
        signatureAlgorithm: request.signatureAlgorithm
      },
      digicertCertificateId: newCertificateId,
      digicertOrderId: parsed.digicert.orderId,
      encryptedPrivateKey: request.encryptedPrivateKey ?? undefined,
      isRenewal: parsed.digicert.isRenewal,
      originalCertificateId: parsed.digicert.originalCertificateId
    });

    await deps.certificateRequestService.attachCertificateToRequest({
      certificateRequestId: request.id,
      certificateId
    });
    await copyMetadataFromRequestToCertificate(deps.resourceMetadataDAL, {
      certificateRequestId: request.id,
      certificateId
    });
    logger.info(
      `DigiCert order issued, attached certificate [certificateRequestId=${request.id}] [certificateId=${certificateId}]`
    );
    return { status: CertificateRequestStatus.ISSUED, certificateId, orderStatus };
  }

  if (
    orderStatus === DigiCertOrderStatus.Rejected ||
    orderStatus === DigiCertOrderStatus.Canceled ||
    orderStatus === DigiCertOrderStatus.Expired ||
    orderStatus === DigiCertOrderStatus.Revoked
  ) {
    await deps.certificateRequestService.updateCertificateRequestStatus({
      certificateRequestId: request.id,
      status: CertificateRequestStatus.FAILED,
      errorMessage: `DigiCert order ${orderStatus}`
    });
    logger.info(`DigiCert order terminal state [certificateRequestId=${request.id}] [status=${orderStatus}]`);
    return {
      status: CertificateRequestStatus.FAILED,
      orderStatus,
      reason: `DigiCert order ${orderStatus}`
    };
  }

  await deps.certificateRequestDAL.updateById(request.id, {
    metadata: JSON.stringify({
      ...parsed,
      digicert: {
        ...parsed.digicert,
        lastCheckedAt: new Date().toISOString(),
        lastCheckStatus: lastCheckStatus ?? orderStatus
      }
    })
  });

  return { status: CertificateRequestStatus.PENDING_VALIDATION, orderStatus };
};
