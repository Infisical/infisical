import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import { CERT_MANAGER_SIGNER_RESOURCE_TYPE, SignerAlertEvent } from "@app/services/signer/signer-alert-events";
import { PkiAlertScope } from "@app/services/telemetry/telemetry-types";

import { TAlertPayload } from "../alert-channel-types";
import { durationToDays, expirySeverity, formatUtcDate, humanizeDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertPermissionAction,
  AlertTriggerType,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IScheduledAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TAlertTelemetryInput,
  TFindScheduledTargetsInput
} from "../alert-types";
import {
  assertCertManagerAlertChannelTypesAllowed,
  buildCertificateManagerAlertAuditEvent,
  buildPkiAlertTelemetryEvent,
  CERT_MANAGER_ALERT_PERMISSION_ACTIONS,
  certificateDisplayName,
  expirationDedupWindowHours,
  ExpiryFieldsSchema,
  resolveCertManagerProjectId,
  splitAltNames
} from "./cert-manager-alert-fns";
import { TCertManagerSignerAlertDALFactory, TSignerAlertCertificate } from "./cert-manager-signer-alert-dal";

const SignerExpirationConditionSchema = ExpiryFieldsSchema.strict();

const assertNoResource = (resourceId?: string | null) => {
  if (resourceId) {
    throw new BadRequestError({
      message:
        "Signer certificate expiration alerts cover every signer in Certificate Manager and can't be bound to a resource. Remove resourceId."
    });
  }
};

const getWebhookSource = ({ alertId }: { alertId: string }) => `/alerts/${alertId}`;

const formatSigners = (signerNames: string[]) =>
  `${signerNames.length === 1 ? "signer" : "signers"} ${signerNames.map((name) => `'${name}'`).join(", ")}`;

export type TCertManagerSignerAlertProviderDep = {
  certManagerSignerAlertDAL: TCertManagerSignerAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">;
};

export const certManagerSignerAlertProviderFactory = ({
  certManagerSignerAlertDAL,
  permissionService,
  licenseService,
  certManagerProjectResolver
}: TCertManagerSignerAlertProviderDep): IScheduledAlertProvider<TSignerAlertCertificate> => {
  const findScheduledTargets = async (input: TFindScheduledTargetsInput): Promise<TSignerAlertCertificate[]> => {
    if (!input.projectId || input.resourceId || !input.alreadyAlerted?.channelIds.length) return [];
    const { alertBefore } = SignerExpirationConditionSchema.parse(input.condition);

    return certManagerSignerAlertDAL.findExpiringSignerCertificates({
      projectId: input.projectId,
      alertBeforeInterval: `${durationToDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf,
      alreadyAlerted: input.alreadyAlerted
    });
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}/code-signing`;

  const buildPayload = (alert: TAlertContext, targets: TSignerAlertCertificate[], viewUrl: string): TAlertPayload => {
    const { alertBefore } = alert.condition as { alertBefore: string };

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        condition: alertBefore,
        viewUrl
      },
      eventKey: SignerAlertEvent.CertificateExpiry,
      eventLabel: "Expiration",
      webhookType: `com.infisical.${SignerAlertEvent.CertificateExpiry}`,
      webhookSource: getWebhookSource({ alertId: alert.id }),
      resourceKind: "Signer Certificate",
      resourceOwnerKind: "Certificate Manager",
      severity: expirySeverity(targets.map((target) => target.notAfter)),
      summary: `${targets.length} signer certificate${targets.length === 1 ? "" : "s"} expiring within ${humanizeDays(durationToDays(alertBefore))}`,
      items: targets.map((certificate) => {
        const altNames = splitAltNames(certificate.altNames);
        return {
          id: certificate.id,
          title: certificateDisplayName(certificate),
          summary: `Certificate '${certificateDisplayName(certificate)}' of ${formatSigners(certificate.signerNames)} expires on ${formatUtcDate(certificate.notAfter)}`,
          severity: expirySeverity([certificate.notAfter]),
          fields: [
            {
              label: certificate.signerNames.length === 1 ? "Signer" : "Signers",
              value: certificate.signerNames.join(", ")
            },
            { label: "Serial Number", value: certificate.serialNumber },
            ...(altNames.length ? [{ label: "SANs", value: altNames.join(", ") }] : []),
            { label: "Expires", value: formatUtcDate(certificate.notAfter) }
          ],
          resource: {
            id: certificate.id,
            serialNumber: certificate.serialNumber,
            commonName: certificate.commonName,
            altNames,
            status: certificate.status,
            notBefore: certificate.notBefore.toISOString(),
            notAfter: certificate.notAfter.toISOString(),
            signerIds: certificate.signerIds,
            signerNames: certificate.signerNames
          }
        };
      })
    };
  };

  const assertPermission = async ({ action, projectId, resourceId, actor }: TAlertPermissionInput): Promise<void> => {
    if (!projectId) {
      throw new BadRequestError({ message: "Signer alerts must be created in Certificate Manager" });
    }
    assertNoResource(resourceId);

    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor: actor.actor,
      actorId: actor.actorId,
      projectId,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      CERT_MANAGER_ALERT_PERMISSION_ACTIONS[action],
      ProjectPermissionSub.PkiAlerts
    );

    const definesDelivery = action === AlertPermissionAction.Create || action === AlertPermissionAction.Edit;
    if (definesDelivery && !hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message:
          "Signer certificate expiration alerts send certificate details from every signer, so only Certificate Manager admins can create or edit them."
      });
    }
  };

  const getTelemetryEvent = ({ action, orgId, projectId }: TAlertTelemetryInput) => {
    if (!projectId) return undefined;
    return buildPkiAlertTelemetryEvent(
      action,
      { orgId, projectId, alertScope: PkiAlertScope.CertificateManager },
      "signer-certificate-expiration"
    );
  };

  return {
    resourceType: CERT_MANAGER_SIGNER_RESOURCE_TYPE,
    supportsScopeWideAlerts: true,
    events: [
      {
        key: SignerAlertEvent.CertificateExpiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: SignerExpirationConditionSchema
      }
    ],
    findScheduledTargets,
    buildViewUrl,
    buildPayload,
    targetId: (certificate) => certificate.id,
    dedupWindowHours: (condition) => {
      const parsed = SignerExpirationConditionSchema.safeParse(condition);
      if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
      return expirationDedupWindowHours(durationToDays(parsed.data.alertBefore), parsed.data.dailyReminder);
    },
    assertPermission,
    assertResourceInScope: async ({ resourceId }) => assertNoResource(resourceId),
    assertChannelTypesAllowed: (input) => assertCertManagerAlertChannelTypesAllowed(licenseService, input),
    recipientPolicy: { atOrgScope: true, allowEmailAddresses: true },
    includeLastRun: true,
    getAuditEvent: (input) => buildCertificateManagerAlertAuditEvent(input, { applications: [], profiles: [] }),
    getWebhookSource,
    getTelemetryEvent,
    resolveProjectId: async ({ orgId, resourceId }) => {
      assertNoResource(resourceId);
      return resolveCertManagerProjectId(certManagerProjectResolver, orgId);
    }
  };
};
