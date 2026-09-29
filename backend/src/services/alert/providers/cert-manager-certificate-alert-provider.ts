import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE,
  CERTIFICATE_ALERT_EVENT_BY_PROJECT_EVENT,
  LEGACY_PKI_ALERT_EVENT_BY_CERTIFICATE_ALERT_EVENT,
  ProjectCertificateAlertEvent
} from "@app/services/certificate/certificate-alert-events";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertTelemetryAction,
  AlertTriggerType,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IEventAlertProvider,
  IScheduledAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TAlertTelemetryEvent,
  TAlertTelemetryInput,
  TFindDueTargetsInput,
  TFindTargetsByIdsInput
} from "../alert-types";
import { TAlertCertificate, TCertManagerCertificateAlertDALFactory } from "./cert-manager-certificate-alert-dal";
import {
  alertBeforeDays,
  assertCertificateAlertChannelTypesAllowed,
  buildCertificateAlertPayload,
  ExpiryConditionFieldsSchema,
  expiryDedupWindowHours,
  PERMISSION_ACTIONS
} from "./cert-manager-certificate-alert-fns";

const MAX_SCOPE_FILTER_IDS = 100;

const LowercaseUuidSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

const ScopeFilterSchema = z.object({
  applicationIds: z
    .array(LowercaseUuidSchema)
    .min(1, "applicationIds must list at least one application. Omit it to cover every application.")
    .max(MAX_SCOPE_FILTER_IDS)
    .optional(),
  profileIds: z
    .array(LowercaseUuidSchema)
    .min(1, "profileIds must list at least one profile. Omit it to cover every profile.")
    .max(MAX_SCOPE_FILTER_IDS)
    .optional()
});

const ExpirationConditionSchema = ExpiryConditionFieldsSchema.merge(ScopeFilterSchema).strict();

const EventConditionSchema = ScopeFilterSchema.strict().nullish();

const formatIds = (ids: string[]) => ids.map((id) => `'${id}'`).join(", ");

export type TCertManagerCertificateAlertProviderDep = {
  certManagerCertificateAlertDAL: TCertManagerCertificateAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export const certManagerCertificateAlertProviderFactory = ({
  certManagerCertificateAlertDAL,
  permissionService,
  licenseService
}: TCertManagerCertificateAlertProviderDep): IScheduledAlertProvider<TAlertCertificate> &
  IEventAlertProvider<TAlertCertificate> => {
  const findDueTargets = async (input: TFindDueTargetsInput): Promise<TAlertCertificate[]> => {
    if (!input.projectId) return [];
    const { alertBefore, applicationIds, profileIds } = ExpirationConditionSchema.parse(input.condition);

    return certManagerCertificateAlertDAL.findExpiringCertificates({
      projectId: input.projectId,
      applicationIds,
      profileIds,
      alertBeforeInterval: `${alertBeforeDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf,
      alreadyAlerted: input.alreadyAlerted
    });
  };

  const findTargetsByIds = async (input: TFindTargetsByIdsInput): Promise<TAlertCertificate[]> => {
    if (!input.projectId) return [];
    const condition = EventConditionSchema.parse(input.condition);

    return certManagerCertificateAlertDAL.findCertificatesByIds({
      projectId: input.projectId,
      applicationIds: condition?.applicationIds,
      profileIds: condition?.profileIds,
      certificateIds: input.targetIds
    });
  };

  const getTelemetryEvent = ({
    action,
    orgId,
    projectId,
    eventType
  }: TAlertTelemetryInput): TAlertTelemetryEvent | undefined => {
    if (!projectId) return undefined;
    const properties = { orgId, projectId };
    switch (action) {
      case AlertTelemetryAction.Create:
        return {
          event: PostHogEventTypes.PkiAlertCreated,
          properties: {
            ...properties,
            alertType:
              LEGACY_PKI_ALERT_EVENT_BY_CERTIFICATE_ALERT_EVENT[
                CERTIFICATE_ALERT_EVENT_BY_PROJECT_EVENT[eventType as ProjectCertificateAlertEvent]
              ]
          }
        };
      case AlertTelemetryAction.Update:
        return { event: PostHogEventTypes.PkiAlertUpdated, properties };
      default:
        return { event: PostHogEventTypes.PkiAlertDeleted, properties };
    }
  };

  const assertPermission = async ({ action, projectId, actor }: TAlertPermissionInput): Promise<void> => {
    if (!projectId) {
      throw new BadRequestError({ message: "Certificate alerts must be created in a Certificate Manager project" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.actor,
      actorId: actor.actorId,
      projectId,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(PERMISSION_ACTIONS[action], ProjectPermissionSub.PkiAlerts);
  };

  const assertResourceInScope = async ({ resourceId }: { resourceId?: string | null }): Promise<void> => {
    if (resourceId) {
      throw new BadRequestError({
        message:
          "Project alerts cover the whole project and can't be bound to a resource. Remove resourceId, or narrow the alert with applicationIds and profileIds."
      });
    }
  };

  const assertConditionInScope = async (input: {
    projectId?: string | null;
    condition: unknown;
    previousCondition?: unknown;
  }): Promise<void> => {
    if (!input.projectId) return;
    const { applicationIds = [], profileIds = [] } = ScopeFilterSchema.parse(input.condition ?? {});

    const previous = ScopeFilterSchema.safeParse(input.previousCondition ?? {});
    const savedApplicationIds = new Set(previous.success ? previous.data.applicationIds : []);
    const savedProfileIds = new Set(previous.success ? previous.data.profileIds : []);
    const addedApplicationIds = applicationIds.filter((id) => !savedApplicationIds.has(id));
    const addedProfileIds = profileIds.filter((id) => !savedProfileIds.has(id));

    const noIds: string[] = [];
    const [foundApplicationIds, foundProfileIds] = await Promise.all([
      addedApplicationIds.length
        ? certManagerCertificateAlertDAL.findProjectApplicationIds(input.projectId, addedApplicationIds)
        : noIds,
      addedProfileIds.length
        ? certManagerCertificateAlertDAL.findProjectProfileIds(input.projectId, addedProfileIds)
        : noIds
    ]);

    const missingApplicationIds = addedApplicationIds.filter((id) => !foundApplicationIds.includes(id));
    if (missingApplicationIds.length) {
      throw new NotFoundError({
        message: `Application(s) not found in this project: ${formatIds(missingApplicationIds)}`
      });
    }
    const missingProfileIds = addedProfileIds.filter((id) => !foundProfileIds.includes(id));
    if (missingProfileIds.length) {
      throw new NotFoundError({
        message: `Certificate profile(s) not found in this project: ${formatIds(missingProfileIds)}`
      });
    }
  };

  return {
    resourceType: CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE,
    allowsMultipleAlertsPerEvent: true,
    supportsScopeWideAlerts: true,
    events: [
      {
        key: ProjectCertificateAlertEvent.Expiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: ExpirationConditionSchema
      },
      ...[
        ProjectCertificateAlertEvent.Issuance,
        ProjectCertificateAlertEvent.Renewal,
        ProjectCertificateAlertEvent.Revocation
      ].map((key) => ({
        key,
        triggerType: AlertTriggerType.Event,
        conditionSchema: EventConditionSchema
      }))
    ],
    findDueTargets,
    findTargetsByIds,
    buildViewUrl: async (alert: TAlertContext) =>
      `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}/inventory`,
    buildPayload: (alert, targets, viewUrl) =>
      buildCertificateAlertPayload({
        alert,
        targets,
        viewUrl,
        eventType: CERTIFICATE_ALERT_EVENT_BY_PROJECT_EVENT[alert.eventType as ProjectCertificateAlertEvent],
        isApplicationAlert: false
      }),
    getTelemetryEvent,
    targetId: (certificate) => certificate.id,
    dedupWindowHours: (condition) => {
      const parsed = ExpirationConditionSchema.safeParse(condition);
      if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
      return expiryDedupWindowHours(parsed.data.alertBefore, parsed.data.dailyReminder);
    },
    assertPermission,
    assertResourceInScope,
    assertConditionInScope,
    assertChannelTypesAllowed: (input) => assertCertificateAlertChannelTypesAllowed(licenseService, input)
  };
};
