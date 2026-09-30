import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import {
  CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE,
  CertificateAlertEvent
} from "@app/services/certificate/certificate-alert-events";
import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { durationToDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertTelemetryAction,
  AlertTriggerType,
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
  assertCertificateAlertChannelTypesAllowed,
  buildCertificateAlertPayload,
  CERTIFICATE_ALERT_PERMISSION_ACTIONS,
  CERTIFICATE_ALERT_TELEMETRY_TYPES,
  certificateAlertDedupWindowHours,
  ExpiryConditionFieldsSchema,
  MAX_CERTIFICATE_ALERT_FILTER_IDS,
  resolveOrgCertManagerProjectId
} from "./cert-manager-certificate-alert-fns";

const LowercaseUuidSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

const CertificateFilterSchema = z.object({
  applicationIds: z
    .array(LowercaseUuidSchema)
    .min(1, "applicationIds must list at least one application. Omit it to cover every application.")
    .max(MAX_CERTIFICATE_ALERT_FILTER_IDS)
    .optional(),
  profileIds: z
    .array(LowercaseUuidSchema)
    .min(1, "profileIds must list at least one profile. Omit it to cover every profile.")
    .max(MAX_CERTIFICATE_ALERT_FILTER_IDS)
    .optional()
});

const ExpirationConditionSchema = ExpiryConditionFieldsSchema.merge(CertificateFilterSchema).strict();

const EventConditionSchema = CertificateFilterSchema.strict().nullish();

const formatIds = (ids: string[]) => ids.map((id) => `'${id}'`).join(", ");

export type TCertManagerCertificateAlertProviderDep = {
  certManagerCertificateAlertDAL: TCertManagerCertificateAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">;
};

export const certManagerCertificateAlertProviderFactory = ({
  certManagerCertificateAlertDAL,
  permissionService,
  licenseService,
  certManagerProjectResolver
}: TCertManagerCertificateAlertProviderDep): IScheduledAlertProvider<TAlertCertificate> &
  IEventAlertProvider<TAlertCertificate> => {
  const findDueTargets = async (input: TFindDueTargetsInput): Promise<TAlertCertificate[]> => {
    if (!input.projectId) return [];
    const { alertBefore, applicationIds, profileIds } = ExpirationConditionSchema.parse(input.condition);

    return certManagerCertificateAlertDAL.findExpiringCertificates({
      projectId: input.projectId,
      applicationIds,
      profileIds,
      alertBeforeInterval: `${durationToDays(alertBefore)} days`,
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
    const properties = { orgId, projectId, alertScope: PkiAlertScope.CertificateManager };
    switch (action) {
      case AlertTelemetryAction.Create:
        return {
          event: PostHogEventTypes.PkiAlertCreated,
          properties: {
            ...properties,
            alertType: CERTIFICATE_ALERT_TELEMETRY_TYPES[eventType as CertificateAlertEvent]
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
      throw new BadRequestError({ message: "Certificate alerts must be created in Certificate Manager" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.actor,
      actorId: actor.actorId,
      projectId,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      CERTIFICATE_ALERT_PERMISSION_ACTIONS[action],
      ProjectPermissionSub.PkiAlerts
    );
  };

  const assertResourceInScope = async ({ resourceId }: { resourceId?: string | null }): Promise<void> => {
    if (resourceId) {
      throw new BadRequestError({
        message:
          "These alerts cover all of Certificate Manager and can't be bound to a resource. Remove resourceId, or narrow the alert with applicationIds and profileIds."
      });
    }
  };

  const assertConditionInScope = async (input: {
    projectId?: string | null;
    condition: unknown;
    previousCondition?: unknown;
  }): Promise<void> => {
    if (!input.projectId) return;
    const { applicationIds = [], profileIds = [] } = CertificateFilterSchema.parse(input.condition ?? {});

    const previous = CertificateFilterSchema.safeParse(input.previousCondition ?? {});
    const savedApplicationIds = new Set(previous.success ? previous.data.applicationIds : []);
    const savedProfileIds = new Set(previous.success ? previous.data.profileIds : []);
    const addedApplicationIds = applicationIds.filter((id) => !savedApplicationIds.has(id));
    const addedProfileIds = profileIds.filter((id) => !savedProfileIds.has(id));

    const [foundApplicationIds, foundProfileIds]: string[][] = await Promise.all([
      addedApplicationIds.length
        ? certManagerCertificateAlertDAL.findProjectApplicationIds(input.projectId, addedApplicationIds)
        : [],
      addedProfileIds.length
        ? certManagerCertificateAlertDAL.findProjectProfileIds(input.projectId, addedProfileIds)
        : []
    ]);

    const missingApplicationIds = addedApplicationIds.filter((id) => !foundApplicationIds.includes(id));
    if (missingApplicationIds.length) {
      throw new NotFoundError({
        message: `Application(s) not found in Certificate Manager: ${formatIds(missingApplicationIds)}`
      });
    }
    const missingProfileIds = addedProfileIds.filter((id) => !foundProfileIds.includes(id));
    if (missingProfileIds.length) {
      throw new NotFoundError({
        message: `Certificate profile(s) not found in Certificate Manager: ${formatIds(missingProfileIds)}`
      });
    }
  };

  return {
    resourceType: CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE,
    allowsMultipleAlertsPerEvent: true,
    supportsScopeWideAlerts: true,
    events: [
      {
        key: CertificateAlertEvent.Expiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: ExpirationConditionSchema
      },
      ...[CertificateAlertEvent.Issuance, CertificateAlertEvent.Renewal, CertificateAlertEvent.Revocation].map(
        (key) => ({
          key,
          triggerType: AlertTriggerType.Event,
          conditionSchema: EventConditionSchema
        })
      )
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
        eventType: alert.eventType as CertificateAlertEvent,
        isApplicationAlert: false
      }),
    getTelemetryEvent,
    targetId: (certificate) => certificate.id,
    dedupWindowHours: certificateAlertDedupWindowHours,
    assertPermission,
    assertResourceInScope,
    assertConditionInScope,
    assertChannelTypesAllowed: (input) => assertCertificateAlertChannelTypesAllowed(licenseService, input),
    resolveProjectId: ({ orgId }) => resolveOrgCertManagerProjectId(certManagerProjectResolver, orgId)
  };
};
