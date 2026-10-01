import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ResourceType } from "@app/db/schemas";
import { Event as TAuditEvent, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ResourcePermissionSub } from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import {
  ApplicationCertificateAlertEvent,
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CERTIFICATE_EVENT_BY_APPLICATION_EVENT
} from "@app/services/certificate/certificate-alert-events";
import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { durationToDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertAuditAction,
  AlertTelemetryAction,
  AlertTriggerType,
  IEventAlertProvider,
  IScheduledAlertProvider,
  TAlertAuditInput,
  TAlertContext,
  TAlertPermissionInput,
  TAlertTelemetryEvent,
  TAlertTelemetryInput,
  TFindEventTargetsInput,
  TFindScheduledTargetsInput
} from "../alert-types";
import { TAlertCertificate, TCertManagerCertificateAlertDALFactory } from "./cert-manager-certificate-alert-dal";
import {
  assertCertificateAlertChannelTypesAllowed,
  buildCertificateAlertPayload,
  CERTIFICATE_ALERT_PERMISSION_ACTIONS,
  CERTIFICATE_ALERT_TELEMETRY_TYPES,
  certificateAlertDedupWindowHours,
  ExpiryConditionFieldsSchema,
  resolveOrgCertManagerProjectId
} from "./cert-manager-certificate-alert-fns";

const ExpirationConditionSchema = ExpiryConditionFieldsSchema.strict();

const EventConditionSchema = z.object({}).strict().nullish();

const assertValidApplicationId = (applicationId: string) => {
  if (!z.string().uuid().safeParse(applicationId).success) {
    throw new BadRequestError({ message: `Invalid application ID '${applicationId}': must be a UUID` });
  }
};

export type TCertManagerApplicationAlertProviderDep = {
  certManagerCertificateAlertDAL: TCertManagerCertificateAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">;
};

export const certManagerApplicationAlertProviderFactory = ({
  certManagerCertificateAlertDAL,
  permissionService,
  licenseService,
  certManagerProjectResolver
}: TCertManagerApplicationAlertProviderDep): IScheduledAlertProvider<TAlertCertificate> &
  IEventAlertProvider<TAlertCertificate> => {
  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const base = `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}`;
    const application = alert.resourceId
      ? await certManagerCertificateAlertDAL.findApplicationById(alert.resourceId)
      : undefined;
    return application ? `${base}/applications/${encodeURIComponent(application.name)}` : `${base}/applications`;
  };

  const findScheduledTargets = async (input: TFindScheduledTargetsInput): Promise<TAlertCertificate[]> => {
    if (!input.projectId || !input.resourceId) return [];
    const { alertBefore } = ExpirationConditionSchema.parse(input.condition);

    return certManagerCertificateAlertDAL.findExpiringCertificates({
      projectId: input.projectId,
      applicationId: input.resourceId,
      alertBeforeInterval: `${durationToDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf,
      alreadyAlerted: input.alreadyAlerted
    });
  };

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TAlertCertificate[]> => {
    if (!input.projectId || !input.resourceId) return [];
    EventConditionSchema.parse(input.condition);

    return certManagerCertificateAlertDAL.findCertificatesByIds({
      projectId: input.projectId,
      applicationId: input.resourceId,
      certificateIds: input.targetIds
    });
  };

  const getWebhookSource = ({ alertId, resourceId }: { alertId: string; resourceId?: string | null }) =>
    resourceId ? `/applications/${resourceId}/alerts/${alertId}` : undefined;

  const getAuditEvent = (input: TAlertAuditInput): TAuditEvent => {
    if (input.action === AlertAuditAction.TestChannel) {
      const { test } = input;
      return {
        type: EventType.TEST_PKI_APPLICATION_ALERT_CHANNEL,
        metadata: {
          applicationId: test.resourceId ?? null,
          applicationName: test.resourceName ?? null,
          alertId: test.alertId,
          alertName: test.alertName ?? null,
          channelId: test.channelId,
          channelName: test.channelName ?? null,
          channelType: test.channelType,
          success: test.success,
          deliveredTo: test.deliveredTo,
          error: test.error
        }
      };
    }

    const metadata = {
      applicationId: input.alert.resourceId,
      applicationName: input.alert.resourceName ?? null,
      alertId: input.alert.id,
      name: input.alert.name,
      eventType: input.alert.eventType
    };
    if (input.action === AlertAuditAction.Create) return { type: EventType.CREATE_PKI_APPLICATION_ALERT, metadata };
    if (input.action === AlertAuditAction.Update) return { type: EventType.UPDATE_PKI_APPLICATION_ALERT, metadata };
    return { type: EventType.DELETE_PKI_APPLICATION_ALERT, metadata };
  };

  const getTelemetryEvent = ({
    action,
    orgId,
    projectId,
    resourceId,
    eventType
  }: TAlertTelemetryInput): TAlertTelemetryEvent | undefined => {
    if (!projectId || !resourceId) return undefined;
    const properties = { orgId, projectId, applicationId: resourceId, alertScope: PkiAlertScope.Application };
    switch (action) {
      case AlertTelemetryAction.Create:
        return {
          event: PostHogEventTypes.PkiAlertCreated,
          properties: {
            ...properties,
            alertType:
              CERTIFICATE_ALERT_TELEMETRY_TYPES[
                CERTIFICATE_EVENT_BY_APPLICATION_EVENT[eventType as ApplicationCertificateAlertEvent]
              ]
          }
        };
      case AlertTelemetryAction.Update:
        return { event: PostHogEventTypes.PkiAlertUpdated, properties };
      default:
        return { event: PostHogEventTypes.PkiAlertDeleted, properties };
    }
  };

  const assertPermission = async ({ action, projectId, resourceId, actor }: TAlertPermissionInput): Promise<void> => {
    if (!projectId) {
      throw new BadRequestError({ message: "Certificate alerts must be created in Certificate Manager" });
    }

    if (!resourceId) {
      throw new BadRequestError({ message: "Application alerts require an application ID" });
    }

    assertValidApplicationId(resourceId);
    const { permission } = await permissionService.getResourcePermission({
      actor: actor.actor,
      actorId: actor.actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      CERTIFICATE_ALERT_PERMISSION_ACTIONS[action],
      ResourcePermissionSub.PkiAlerts
    );
  };

  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (!input.resourceId) return;
    assertValidApplicationId(input.resourceId);

    const application = await certManagerCertificateAlertDAL.findApplicationById(input.resourceId);
    if (!application || application.orgId !== input.orgId || application.projectId !== input.projectId) {
      throw new NotFoundError({
        message: `Application with ID '${input.resourceId}' not found in Certificate Manager`
      });
    }
  };

  const resolveProjectId = async ({ orgId, resourceId }: { orgId: string; resourceId?: string | null }) => {
    if (!resourceId) return resolveOrgCertManagerProjectId(certManagerProjectResolver, orgId);
    assertValidApplicationId(resourceId);
    const application = await certManagerCertificateAlertDAL.findApplicationById(resourceId);
    if (!application || application.orgId !== orgId) {
      throw new NotFoundError({ message: `Application with ID '${resourceId}' not found` });
    }
    return application.projectId;
  };

  return {
    resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
    events: [
      {
        key: ApplicationCertificateAlertEvent.Expiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: ExpirationConditionSchema
      },
      ...[
        ApplicationCertificateAlertEvent.Issuance,
        ApplicationCertificateAlertEvent.Renewal,
        ApplicationCertificateAlertEvent.Revocation
      ].map((key) => ({
        key,
        triggerType: AlertTriggerType.Event,
        conditionSchema: EventConditionSchema
      }))
    ],
    findScheduledTargets,
    findEventTargets,
    buildViewUrl,
    buildPayload: (alert, targets, viewUrl) =>
      buildCertificateAlertPayload({
        alert,
        targets,
        viewUrl,
        eventType: CERTIFICATE_EVENT_BY_APPLICATION_EVENT[alert.eventType as ApplicationCertificateAlertEvent],
        isApplicationAlert: true,
        webhookSource: getWebhookSource({ alertId: alert.id, resourceId: alert.resourceId })
      }),
    getTelemetryEvent,
    targetId: (certificate) => certificate.id,
    dedupWindowHours: certificateAlertDedupWindowHours,
    assertPermission,
    assertResourceInScope,
    assertChannelTypesAllowed: (input) => assertCertificateAlertChannelTypesAllowed(licenseService, input),
    recipientPolicy: { atOrgScope: true, allowEmailAddresses: true },
    includeLastRun: true,
    getAuditEvent,
    getWebhookSource,
    resolveProjectId,
    getResourceNames: async ({ orgId, resourceIds }) =>
      new Map(
        (await certManagerCertificateAlertDAL.findApplicationNamesByIds(resourceIds, orgId)).map((app) => [
          app.id,
          app.name
        ])
      )
  };
};
