import { logger } from "@app/lib/logger";
import { CertificateIssuanceOperation } from "@app/services/certificate-common/certificate-constants";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export type TReportCertificateIssuedDTO = {
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  projectId: string;
  enrollmentType: string;
  operation: CertificateIssuanceOperation;
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
    // orgId is non-nullable on a project, so this only happens if the project was deleted mid-issuance.
    if (!resolvedOrgId) {
      logger.warn(`Skipping certificate issuance telemetry, project not found [projectId=${projectId}]`);
      return;
    }

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
