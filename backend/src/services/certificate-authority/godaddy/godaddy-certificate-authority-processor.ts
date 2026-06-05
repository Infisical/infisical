import { TCertificateRequests } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { buildGoDaddySsoKeyHeader } from "@app/services/app-connection/godaddy/godaddy-connection-constants";
import { getGoDaddyApiBaseUrl } from "@app/services/app-connection/godaddy/godaddy-connection-fns";
import { TGoDaddyConnection } from "@app/services/app-connection/godaddy/godaddy-connection-types";
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
import { createGoDaddyApiClient, TGoDaddyApiClient } from "./godaddy-api-client";
import {
  GODADDY_FINAL_ISSUED_STATUSES,
  GODADDY_TERMINAL_FAILURE_STATUSES,
  GoDaddyProcessorOutcome
} from "./godaddy-certificate-authority-enums";
import {
  castDbEntryToGoDaddyCertificateAuthority,
  GoDaddyRenewalNotReadyError,
  TGoDaddyCertificateAuthorityFns
} from "./godaddy-certificate-authority-fns";
import { GoDaddyCertificateRequestMetadataSchema } from "./godaddy-certificate-authority-schemas";

export const GODADDY_VALIDATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export type TGoDaddyOrderMetadata = {
  godaddy: {
    certificateId: string;
    productType: string;
    orderPlacedAt: string;
    lastCheckedAt?: string;
    lastCheckStatus?: string;
    isRenewal?: boolean;
    originalCertificateId?: string;
  };
};

export type TGoDaddyCertificateRequestServiceDep = {
  updateCertificateRequestStatus: (args: TUpdateCertificateRequestStatusDTO) => Promise<unknown>;
  attachCertificateToRequest: (args: TAttachCertificateToRequestDTO) => Promise<unknown>;
};

export type TProcessGoDaddyRequestDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "setPendingMessage">;
  certificateRequestService: TGoDaddyCertificateRequestServiceDep;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany">;
  godaddyFns: Pick<TGoDaddyCertificateAuthorityFns, "fetchAndAttachIssuedCertificate">;
};

export type TProcessGoDaddyRequestResult =
  | { status: CertificateRequestStatus.ISSUED; certificateId: string; orderStatus: string }
  | { status: CertificateRequestStatus.FAILED; orderStatus: string; reason: string }
  | { status: CertificateRequestStatus.PENDING_VALIDATION; orderStatus: string }
  | { status: GoDaddyProcessorOutcome.Skipped; reason: string };

const getOrCreateClient = async (
  request: TCertificateRequests,
  deps: Pick<TProcessGoDaddyRequestDeps, "certificateAuthorityDAL" | "appConnectionDAL" | "kmsService">,
  clientCache?: Map<string, TGoDaddyApiClient>
): Promise<TGoDaddyApiClient> => {
  if (!request.caId) {
    throw new Error(`certificate request is missing caId [certificateRequestId=${request.id}]`);
  }
  const cached = clientCache?.get(request.caId);
  if (cached) return cached;

  const ca = await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(request.caId);
  const godaddyCa = castDbEntryToGoDaddyCertificateAuthority(ca);
  const appConnection = await deps.appConnectionDAL.findById(godaddyCa.configuration.appConnectionId);
  if (!appConnection || appConnection.app !== AppConnection.GoDaddy) {
    throw new Error(
      `GoDaddy app connection missing or invalid [certificateRequestId=${request.id}] [caId=${request.caId}]`
    );
  }
  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService: deps.kmsService
  })) as TGoDaddyConnection["credentials"];

  const client = createGoDaddyApiClient(
    buildGoDaddySsoKeyHeader(credentials.apiKey, credentials.apiSecret),
    getGoDaddyApiBaseUrl()
  );
  clientCache?.set(request.caId, client);
  return client;
};

export const processGoDaddyPendingValidationRequest = async (
  deps: TProcessGoDaddyRequestDeps,
  request: TCertificateRequests,
  clientCache?: Map<string, TGoDaddyApiClient>
): Promise<TProcessGoDaddyRequestResult> => {
  if (!request.caId || !request.metadata) {
    return { status: GoDaddyProcessorOutcome.Skipped, reason: "missing caId or metadata" };
  }

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(request.metadata);
  } catch {
    logger.warn(`GoDaddy request metadata could not be parsed [certificateRequestId=${request.id}]`);
    return { status: GoDaddyProcessorOutcome.Skipped, reason: "unparseable metadata" };
  }

  const parseResult = GoDaddyCertificateRequestMetadataSchema.safeParse(rawMetadata);
  if (!parseResult.success) {
    logger.warn(
      { err: parseResult.error },
      `GoDaddy request metadata failed schema validation [certificateRequestId=${request.id}]`
    );
    return { status: GoDaddyProcessorOutcome.Skipped, reason: "metadata did not match schema" };
  }
  const parsed = parseResult.data as TGoDaddyOrderMetadata;

  const age = Date.now() - new Date(parsed.godaddy.orderPlacedAt).getTime();
  if (age >= GODADDY_VALIDATION_TIMEOUT_MS) {
    await deps.certificateRequestService.updateCertificateRequestStatus({
      certificateRequestId: request.id,
      status: CertificateRequestStatus.FAILED,
      errorMessage: "Validation timed out after 24h"
    });
    logger.info(`GoDaddy validation timed out [certificateRequestId=${request.id}]`);
    return { status: CertificateRequestStatus.FAILED, orderStatus: "timeout", reason: "timeout" };
  }

  const client = await getOrCreateClient(request, deps, clientCache);

  const certificateInfo = await client.getCertificate(parsed.godaddy.certificateId);
  const orderStatus = (certificateInfo.status ?? "unknown").toUpperCase();

  const isFinalisable = GODADDY_FINAL_ISSUED_STATUSES.some((status) => status === orderStatus);
  if (isFinalisable) {
    try {
      const { certificateId } = await deps.godaddyFns.fetchAndAttachIssuedCertificate({
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
        godaddyCertificateId: parsed.godaddy.certificateId,
        encryptedPrivateKey: request.encryptedPrivateKey ?? undefined,
        isRenewal: parsed.godaddy.isRenewal,
        originalCertificateId: parsed.godaddy.originalCertificateId,
        applicationId: request.applicationId
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
        `GoDaddy certificate issued, attached certificate [certificateRequestId=${request.id}] [certificateId=${certificateId}]`
      );
      return { status: CertificateRequestStatus.ISSUED, certificateId, orderStatus };
    } catch (error) {
      // A renewal can report ISSUED/CURRENT while GoDaddy is still serving the previous certificate
      // (it only re-issues with a new serial near expiry). Stay pending rather than failing.
      if (!(error instanceof GoDaddyRenewalNotReadyError)) {
        throw error;
      }
      logger.info(
        `GoDaddy renewal accepted but not yet re-issued, staying pending [certificateRequestId=${request.id}]`
      );
    }
  }

  if (GODADDY_TERMINAL_FAILURE_STATUSES.some((status) => status === orderStatus)) {
    await deps.certificateRequestService.updateCertificateRequestStatus({
      certificateRequestId: request.id,
      status: CertificateRequestStatus.FAILED,
      errorMessage: `GoDaddy certificate ${orderStatus}`
    });
    logger.info(`GoDaddy certificate terminal state [certificateRequestId=${request.id}] [status=${orderStatus}]`);
    return {
      status: CertificateRequestStatus.FAILED,
      orderStatus,
      reason: `GoDaddy certificate ${orderStatus}`
    };
  }

  await deps.certificateRequestDAL.updateById(request.id, {
    metadata: JSON.stringify({
      ...parsed,
      godaddy: {
        ...parsed.godaddy,
        lastCheckedAt: new Date().toISOString(),
        lastCheckStatus: orderStatus
      }
    })
  });

  try {
    await deps.certificateRequestDAL.setPendingMessage(
      request.id,
      `GoDaddy is processing the request — certificate ${parsed.godaddy.certificateId} (status: ${orderStatus})`
    );
  } catch (error) {
    logger.warn(error, `Failed to update GoDaddy pendingMessage [certificateRequestId=${request.id}]`);
  }

  return { status: CertificateRequestStatus.PENDING_VALIDATION, orderStatus };
};
