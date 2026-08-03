import { logger } from "@app/lib/logger";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export type TCertificateIssuanceOperation = "issue" | "sign" | "order" | "renew";

export type TReportCertificateIssuedDTO = {
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  projectId: string;
  enrollmentType: string;
  operation: TCertificateIssuanceOperation;
  profileId?: string | null;
  applicationId?: string | null;
  /** Supply when already known, to avoid the project lookup. */
  orgId?: string;
  /** Falls back to `platform/<projectId>` for protocol flows and background jobs. */
  distinctId?: string;
  /** Only needed when `orgId` is not supplied. */
  projectDAL?: Pick<TProjectDALFactory, "findById">;
};

/**
 * Single reporting point for "a certificate now exists".
 *
 * Certificates are issued from several places — the synchronous profile paths, the async external-CA
 * queue, and the DigiCert/GoDaddy polling processors — and every one of them needs to report the same
 * event with the same shape, so they all call this rather than assembling the payload themselves.
 *
 * Only call once the certificate actually exists. An order that is still pending validation has not
 * been issued and must not be counted.
 *
 * Never throws: analytics must not fail an issuance.
 */
export const reportCertificateIssued = async ({
  telemetryService,
  projectId,
  enrollmentType,
  operation,
  profileId,
  applicationId,
  orgId,
  distinctId,
  projectDAL
}: TReportCertificateIssuedDTO) => {
  try {
    const resolvedOrgId = orgId || (projectDAL ? (await projectDAL.findById(projectId))?.orgId : undefined);
    if (!resolvedOrgId) return;

    await telemetryService.sendPostHogEvents({
      event: PostHogEventTypes.IssueCert,
      distinctId: distinctId || `platform/${projectId}`,
      organizationId: resolvedOrgId,
      properties: {
        orgId: resolvedOrgId,
        projectId,
        profileId: profileId ?? undefined,
        applicationId: applicationId ?? undefined,
        enrollmentType,
        operation
      }
    });
  } catch (error) {
    logger.debug({ error }, "Failed to report certificate issuance telemetry");
  }
};
