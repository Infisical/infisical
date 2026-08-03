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
  orgId?: string;
  distinctId?: string;
  /** Only needed when `orgId` is not supplied. */
  projectDAL?: Pick<TProjectDALFactory, "findById">;
};

// Call only once the certificate exists — an order still pending validation is not an issuance.
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
