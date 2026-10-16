import { z } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CERT_MANAGER_RESOURCE_TYPE,
  CertificateApplicationAlertEvent,
  CertificateManagerAlertEvent
} from "@app/services/certificate/certificate-alert-events";
import { PkiAlertScope } from "@app/services/telemetry/telemetry-types";

import { durationToDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertTriggerType,
  IEventAlertProvider,
  IScheduledAlertProvider,
  TAlertContext,
  TAlertFilters,
  TAlertPermissionInput,
  TAlertTelemetryInput,
  TFindEventTargetsInput,
  TFindScheduledTargetsInput
} from "../alert-types";
import {
  assertCertManagerAdminAlertPermission,
  assertCertManagerAlertChannelTypesAllowed,
  assertNoAlertResource,
  buildCertificateAlertPayload,
  buildPkiAlertTelemetryEvent,
  CERTIFICATE_ALERT_KIND_TELEMETRY_TYPES,
  CertificateAlertKind,
  expiryDedupWindowHours,
  ExpiryFieldsSchema,
  getScopeWideAlertWebhookSource,
  resolveCertManagerProjectId
} from "./cert-manager-alert-fns";
import { TAlertCertificate, TCertManagerCertificateAlertDALFactory } from "./cert-manager-certificate-alert-dal";

const MAX_CERTIFICATE_ALERT_FILTER_IDS = 100;

const ALERT_KIND_BY_EVENT: Record<CertificateManagerAlertEvent, CertificateAlertKind> = {
  [CertificateManagerAlertEvent.Expiry]: CertificateAlertKind.Expiry,
  [CertificateManagerAlertEvent.Issuance]: CertificateAlertKind.Issuance,
  [CertificateManagerAlertEvent.Renewal]: CertificateAlertKind.Renewal,
  [CertificateManagerAlertEvent.Revocation]: CertificateAlertKind.Revocation
};

const EVENTS_SOURCED_FROM_APPLICATION_EVENTS: [CertificateManagerAlertEvent, CertificateApplicationAlertEvent][] = [
  [CertificateManagerAlertEvent.Issuance, CertificateApplicationAlertEvent.Issuance],
  [CertificateManagerAlertEvent.Renewal, CertificateApplicationAlertEvent.Renewal],
  [CertificateManagerAlertEvent.Revocation, CertificateApplicationAlertEvent.Revocation]
];

const filterIdsSchema = (field: string, noun: string) =>
  z
    .array(z.string().uuid())
    .min(1, `${field} must list at least one ${noun}. Omit it to cover every ${noun}.`)
    .max(MAX_CERTIFICATE_ALERT_FILTER_IDS)
    .superRefine((ids, ctx) => {
      const seen = new Set<string>();
      const duplicates = new Set<string>();
      ids.forEach((id) => {
        const key = id.toLowerCase();
        if (seen.has(key)) duplicates.add(id);
        seen.add(key);
      });
      if (duplicates.size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} lists the same ID more than once: ${[...duplicates].map((id) => `'${id}'`).join(", ")}`
        });
      }
    })
    .optional();

const CertificateFilterSchema = z.object({
  applicationIds: filterIdsSchema("applicationIds", "application"),
  profileIds: filterIdsSchema("profileIds", "profile"),
  sources: z
    .array(z.nativeEnum(CertificateSource))
    .min(1, "sources must list at least one source. Omit it to cover every source.")
    .refine((sources) => new Set(sources).size === sources.length, "sources lists the same source more than once")
    .optional()
});

const ExpirationConditionSchema = ExpiryFieldsSchema.merge(CertificateFilterSchema).strict();

const EventConditionSchema = CertificateFilterSchema.strict().nullish();

const formatIds = (ids: string[]) => ids.map((id) => `'${id}'`).join(", ");

const toIdSet = (ids: string[] = []) => new Set(ids.map((id) => id.toLowerCase()));

const parseFilters = (condition: unknown) => {
  const filters = CertificateFilterSchema.safeParse(condition ?? {});
  return filters.success ? filters.data : {};
};

const assertNoResource = (resourceId?: string | null) =>
  assertNoAlertResource(
    resourceId,
    "Certificate Manager alerts aren't bound to a single application. Remove resourceId, and use applicationIds to narrow the alert to specific applications."
  );

export type TCertManagerAlertProviderDep = {
  certManagerCertificateAlertDAL: TCertManagerCertificateAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">;
};

export const certManagerAlertProviderFactory = ({
  certManagerCertificateAlertDAL,
  permissionService,
  licenseService,
  certManagerProjectResolver
}: TCertManagerAlertProviderDep): IScheduledAlertProvider<TAlertCertificate> &
  IEventAlertProvider<TAlertCertificate> => {
  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    `${getConfig().SITE_URL}/organizations/${alert.orgId}/cert-manager/inventory`;

  const findScheduledTargets = async (input: TFindScheduledTargetsInput): Promise<TAlertCertificate[]> => {
    if (!input.projectId || input.resourceId || !input.alreadyAlerted?.channelIds.length) return [];
    const { alertBefore, applicationIds, profileIds, sources } = ExpirationConditionSchema.parse(input.condition);

    return certManagerCertificateAlertDAL.findExpiringCertificates({
      projectId: input.projectId,
      applicationIds,
      profileIds,
      sources,
      alertBeforeInterval: `${durationToDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf,
      alreadyAlerted: input.alreadyAlerted
    });
  };

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TAlertCertificate[]> => {
    if (!input.projectId || input.resourceId) return [];
    const condition = EventConditionSchema.parse(input.condition);

    return certManagerCertificateAlertDAL.findCertificatesByIds({
      projectId: input.projectId,
      applicationIds: condition?.applicationIds,
      profileIds: condition?.profileIds,
      sources: condition?.sources,
      certificateIds: input.targetIds
    });
  };

  const buildPayload = (alert: TAlertContext, targets: TAlertCertificate[], viewUrl: string) =>
    buildCertificateAlertPayload({
      alert,
      targets,
      viewUrl,
      kind: ALERT_KIND_BY_EVENT[alert.eventType as CertificateManagerAlertEvent],
      webhookSource: getScopeWideAlertWebhookSource({ alertId: alert.id }),
      resourceOwnerKind: "Certificate Manager",
      applicationName: null
    });

  const getTelemetryEvent = ({ action, orgId, projectId, eventType }: TAlertTelemetryInput) => {
    if (!projectId) return undefined;
    return buildPkiAlertTelemetryEvent(
      action,
      { orgId, projectId, alertScope: PkiAlertScope.CertificateManager },
      CERTIFICATE_ALERT_KIND_TELEMETRY_TYPES[ALERT_KIND_BY_EVENT[eventType as CertificateManagerAlertEvent]]
    );
  };

  const assertPermission = async ({ action, projectId, resourceId, actor }: TAlertPermissionInput): Promise<void> => {
    if (!projectId) {
      throw new BadRequestError({ message: "Certificate alerts must be created in Certificate Manager" });
    }
    assertNoResource(resourceId);

    await assertCertManagerAdminAlertPermission(
      permissionService,
      { action, projectId, actor },
      "Certificate Manager alerts can send details of certificates from any application, so only Certificate Manager admins can create or edit them. Create the alert on an application instead."
    );
  };

  const assertConditionInScope = async (input: {
    projectId?: string | null;
    condition: unknown;
    previousCondition?: unknown;
  }): Promise<void> => {
    if (!input.projectId) return;
    const { applicationIds = [], profileIds = [] } = CertificateFilterSchema.parse(input.condition ?? {});

    const previous = parseFilters(input.previousCondition);
    const savedApplicationIds = toIdSet(previous.applicationIds);
    const savedProfileIds = toIdSet(previous.profileIds);
    const addedApplicationIds = applicationIds.filter((id) => !savedApplicationIds.has(id.toLowerCase()));
    const addedProfileIds = profileIds.filter((id) => !savedProfileIds.has(id.toLowerCase()));

    const [foundApplicationIds, foundProfileIds]: string[][] = await Promise.all([
      addedApplicationIds.length
        ? certManagerCertificateAlertDAL.findProjectApplicationIds(input.projectId, addedApplicationIds)
        : [],
      addedProfileIds.length
        ? certManagerCertificateAlertDAL.findProjectProfileIds(input.projectId, addedProfileIds)
        : []
    ]);

    const foundApplicationIdSet = toIdSet(foundApplicationIds);
    const missingApplicationIds = addedApplicationIds.filter((id) => !foundApplicationIdSet.has(id.toLowerCase()));
    if (missingApplicationIds.length) {
      throw new NotFoundError({
        message: `${missingApplicationIds.length === 1 ? "Application" : "Applications"} not found in Certificate Manager: ${formatIds(missingApplicationIds)}`
      });
    }
    const foundProfileIdSet = toIdSet(foundProfileIds);
    const missingProfileIds = addedProfileIds.filter((id) => !foundProfileIdSet.has(id.toLowerCase()));
    if (missingProfileIds.length) {
      throw new NotFoundError({
        message: `${missingProfileIds.length === 1 ? "Certificate profile" : "Certificate profiles"} not found in Certificate Manager: ${formatIds(missingProfileIds)}`
      });
    }
  };

  const getFilters = async ({
    orgId,
    projectId,
    alerts
  }: {
    orgId: string;
    projectId: string | null;
    alerts: { id: string; condition: unknown }[];
  }): Promise<Map<string, TAlertFilters>> => {
    const filtersByAlert = alerts.map((alert) => ({ id: alert.id, ...parseFilters(alert.condition) }));
    const applicationIds = [...new Set(filtersByAlert.flatMap((filters) => filters.applicationIds ?? []))];
    const profileIds = [...new Set(filtersByAlert.flatMap((filters) => filters.profileIds ?? []))];

    const [applications, profiles] = await Promise.all([
      certManagerCertificateAlertDAL.findApplicationNamesByIds(applicationIds, orgId),
      projectId ? certManagerCertificateAlertDAL.findProfileNamesByIds(projectId, profileIds) : []
    ]);
    const nameById = new Map([...applications, ...profiles].map((entry) => [entry.id.toLowerCase(), entry.name]));

    const withNames = (ids: string[] = []) => ids.map((id) => ({ id, name: nameById.get(id.toLowerCase()) ?? null }));

    return new Map(
      filtersByAlert.map((filters) => [
        filters.id,
        { applications: withNames(filters.applicationIds), profiles: withNames(filters.profileIds) }
      ])
    );
  };

  return {
    resourceType: CERT_MANAGER_RESOURCE_TYPE,
    supportsScopeWideAlerts: true,
    events: [
      {
        key: CertificateManagerAlertEvent.Expiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: ExpirationConditionSchema
      },
      ...EVENTS_SOURCED_FROM_APPLICATION_EVENTS.map(([key, sourceEventKey]) => ({
        key,
        triggerType: AlertTriggerType.Event,
        conditionSchema: EventConditionSchema,
        sourceEvent: { resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE, eventKey: sourceEventKey }
      }))
    ],
    findScheduledTargets,
    findEventTargets,
    buildViewUrl,
    buildPayload,
    getTelemetryEvent,
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
    resolveProjectId: async ({ orgId, resourceId }) => {
      assertNoResource(resourceId);
      return resolveCertManagerProjectId(certManagerProjectResolver, orgId);
    }
  };
};
