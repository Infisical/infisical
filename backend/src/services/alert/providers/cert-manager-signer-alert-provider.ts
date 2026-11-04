import { z } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import { CERT_MANAGER_SIGNER_RESOURCE_TYPE, SignerAlertEvent } from "@app/services/signer/signer-alert-events";
import { PkiAlertScope } from "@app/services/telemetry/telemetry-types";

import { TAlertPayload } from "../alert-channel-types";
import { durationToDays, expirySeverity, formatUtcDate, humanizeDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertTriggerType,
  IScheduledAlertProvider,
  TAlertContext,
  TAlertFilters,
  TAlertPermissionInput,
  TAlertTelemetryInput,
  TFindScheduledTargetsInput
} from "../alert-types";
import {
  assertCertManagerAdminAlertPermission,
  assertCertManagerAlertChannelTypesAllowed,
  assertNoAlertResource,
  buildPkiAlertTelemetryEvent,
  certificateDisplayName,
  expiryDedupWindowHours,
  ExpiryFieldsSchema,
  filterIdsSchema,
  formatIds,
  getScopeWideAlertWebhookSource,
  resolveCertManagerProjectId,
  splitAltNames,
  toIdSet
} from "./cert-manager-alert-fns";
import { TCertManagerSignerAlertDALFactory, TSignerAlertCertificate } from "./cert-manager-signer-alert-dal";

const SignerFilterSchema = z.object({ signerIds: filterIdsSchema("signerIds", "signer") });

const SignerExpirationConditionSchema = ExpiryFieldsSchema.merge(SignerFilterSchema).strict();

const parseFilters = (condition: unknown) => {
  const filters = SignerFilterSchema.safeParse(condition ?? {});
  return filters.success ? filters.data : {};
};

const assertNoResource = (resourceId?: string | null) =>
  assertNoAlertResource(
    resourceId,
    "Signer certificate expiration alerts aren't bound to a single signer. Remove resourceId, and use signerIds to narrow the alert to specific signers."
  );

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
    const { alertBefore, signerIds } = SignerExpirationConditionSchema.parse(input.condition);

    return certManagerSignerAlertDAL.findExpiringSignerCertificates({
      projectId: input.projectId,
      signerIds,
      alertBeforeInterval: `${durationToDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf,
      alreadyAlerted: input.alreadyAlerted
    });
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    `${getConfig().SITE_URL}/organizations/${alert.orgId}/cert-manager/code-signing`;

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
      webhookSource: getScopeWideAlertWebhookSource({ alertId: alert.id }),
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

    await assertCertManagerAdminAlertPermission(
      permissionService,
      { action, projectId, actor },
      "Signer certificate expiration alerts send certificate details from every signer, so only Certificate Manager admins can create or edit them."
    );
  };

  const assertConditionInScope = async (input: {
    projectId?: string | null;
    condition: unknown;
    previousCondition?: unknown;
  }): Promise<void> => {
    if (!input.projectId) return;
    const { signerIds = [] } = SignerFilterSchema.parse(input.condition ?? {});

    const savedSignerIds = toIdSet(parseFilters(input.previousCondition).signerIds);
    const addedSignerIds = signerIds.filter((id) => !savedSignerIds.has(id.toLowerCase()));
    if (!addedSignerIds.length) return;

    const foundSignerIds = toIdSet(
      await certManagerSignerAlertDAL.findProjectSignerIds(input.projectId, addedSignerIds)
    );
    const missingSignerIds = addedSignerIds.filter((id) => !foundSignerIds.has(id.toLowerCase()));
    if (missingSignerIds.length) {
      throw new NotFoundError({
        message: `${missingSignerIds.length === 1 ? "Signer" : "Signers"} not found in Certificate Manager: ${formatIds(missingSignerIds)}`
      });
    }
  };

  const getFilters = async ({
    projectId,
    alerts
  }: {
    projectId: string | null;
    alerts: { id: string; condition: unknown }[];
  }): Promise<Map<string, TAlertFilters>> => {
    const filtersByAlert = alerts.map((alert) => ({ id: alert.id, ...parseFilters(alert.condition) }));
    const signerIds = [...new Set(filtersByAlert.flatMap((filters) => filters.signerIds ?? []))];

    const signers = projectId ? await certManagerSignerAlertDAL.findSignerNamesByIds(projectId, signerIds) : [];
    const nameById = new Map(signers.map((signer) => [signer.id.toLowerCase(), signer.name]));

    return new Map(
      filtersByAlert.map((filters) => [
        filters.id,
        {
          signers: (filters.signerIds ?? []).map((id) => ({ id, name: nameById.get(id.toLowerCase()) ?? null }))
        }
      ])
    );
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
    dedupWindowHours: expiryDedupWindowHours,
    assertPermission,
    assertResourceInScope: async ({ resourceId }) => assertNoResource(resourceId),
    assertConditionInScope,
    assertChannelTypesAllowed: (input) => assertCertManagerAlertChannelTypesAllowed(licenseService, input),
    recipientPolicy: { atOrgScope: true, allowEmailAddresses: true },
    includeLastRun: true,
    getWebhookSource: getScopeWideAlertWebhookSource,
    getFilters,
    getTelemetryEvent,
    resolveProjectId: async ({ orgId, resourceId }) => {
      assertNoResource(resourceId);
      return resolveCertManagerProjectId(certManagerProjectResolver, orgId);
    }
  };
};
