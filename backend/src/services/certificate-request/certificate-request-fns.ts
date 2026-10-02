import { Knex } from "knex";

import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { CertificateIssuanceOperation } from "../certificate-common/certificate-constants";
import { TCertificateRequestDALFactory } from "./certificate-request-dal";
import { CertificateRequestStatus } from "./certificate-request-types";

type TCertificateRequestBookkeepingDAL = Pick<
  TCertificateRequestDALFactory,
  "attachCertificate" | "transitionFromPending"
>;

export const attachCertificateToPendingRequest = async (
  certificateRequestDAL: TCertificateRequestBookkeepingDAL,
  {
    certificateRequestId,
    certificateId,
    projectId,
    operation
  }: {
    certificateRequestId: string;
    certificateId: string;
    projectId: string;
    operation: CertificateIssuanceOperation;
  },
  tx: Knex
) => {
  const attachedRequest = await certificateRequestDAL.attachCertificate(certificateRequestId, certificateId, tx);
  if (!attachedRequest) {
    logger.error(
      { certificateRequestId, projectId, operation },
      `Certificate request left a pending status mid-operation, aborting [certificateRequestId=${certificateRequestId}]`
    );
    throw new InternalServerError({
      message: "Certificate request is no longer pending, so the operation was aborted"
    });
  }
};

export const markPendingRequestFailed = async (
  certificateRequestDAL: TCertificateRequestBookkeepingDAL,
  {
    certificateRequestId,
    error,
    fallbackMessage
  }: { certificateRequestId: string; error: unknown; fallbackMessage: string }
) => {
  try {
    await certificateRequestDAL.transitionFromPending(
      certificateRequestId,
      CertificateRequestStatus.FAILED,
      error instanceof Error ? error.message : fallbackMessage
    );
  } catch (bookkeepingErr) {
    logger.error(
      bookkeepingErr,
      `Failed to mark certificate request as failed [certificateRequestId=${certificateRequestId}]`
    );
  }
};
