import { MongoAbility } from "@casl/ability";
import { z } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CERT_MANAGER_RESOURCE_TYPE,
  CertificateAlertEvent,
  CertificateManagerAlertEvent
} from "@app/services/certificate/certificate-alert-events";
import { PkiAlertScope } from "@app/services/telemetry/telemetry-types";

import { durationToDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertAuditAction,
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  IScheduledAlertProvider,
  TAlertAuditInput,
  TAlertContext,
  TAlertFilters,
  TAlertPermissionInput,
  TAlertTelemetryInput,
  TFindEventTargetsInput,
  TFindScheduledTargetsInput
} from "../alert-types";
import {
  assertCertManagerAlertChannelTypesAllowed,
  assertNoAlertResource,
  buildCertificateAlertPayload,
  buildCertificateManagerAlertAuditEvent,
  buildPkiAlertTelemetryEvent,
  CERTIFICATE_ALERT_KIND_TELEMETRY_TYPES,
  CertificateAlertKind,
  expiryDedupWindowHours,
  ExpiryFieldsSchema,
  getCertManagerAlertPermission,
  resolveCertManagerProjectId
} from "./cert-manager-alert-fns";
import {
  TApplicationAlertCertificate,
  TCertManagerApplicationAlertDALFactory
} from "./cert-manager-application-alert-dal";

const MAX_CERTIFICATE_ALERT_FILTER_IDS = 100;

const ALERT_KIND_BY_EVENT: Record<CertificateManagerAlertEvent, CertificateAlertKind> = {
  [CertificateManagerAlertEvent.Expiry]: CertificateAlertKind.Expiry,
  [CertificateManagerAlertEvent.Issuance]: CertificateAlertKind.Issuance,
  [CertificateManagerAlertEvent.Renewal]: CertificateAlertKind.Renewal,
  [CertificateManagerAlertEvent.Revocation]: CertificateAlertKind.Revocation
};

const RELAYED_EVENTS: [CertificateManagerAlertEvent, CertificateAlertEvent][] = [
  [CertificateManagerAlertEvent.Issuance, CertificateAlertEvent.Issuance],
  [CertificateManagerAlertEvent.Renewal, CertificateAlertEvent.Renewal],
  [CertificateManagerAlertEvent.Revocation, CertificateAlertEvent.Revocation]
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

const isUnconditionalGrant = (rules: ReturnType<MongoAbility<ProjectPermissionSet>["rulesFor"]>) =>
  rules.some((rule) => !rule.inverted && !rule.conditions) && !rules.some((rule) => rule.inverted);

const assertNoResource = (resourceId?: string | null) =>
  assertNoAlertResource(
    resourceId,
    "Certificate Manager alerts cover every application and can't be bound to one. Remove resourceId, or narrow the alert with applicationIds."
  );

const getWebhookSource = ({ alertId }: { alertId: string }) => `/alerts/${alertId}`;

export type TCertManagerAlertProviderDep = {
  certManagerApplicationAlertDAL: TCertManagerApplicationAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">;
};

export const certManagerAlertProviderFactory = ({
  certManagerApplicationAlertDAL,
  permissionService,
  licenseService,
  certManagerProjectResolver
}: TCertManagerAlertProviderDep): IScheduledAlertProvider<TApplicationAlertCertificate> &
  IEventAlertProvider<TApplicationAlertCertificate> => {
  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}/inventory`;

  const findScheduledTargets = async (input: TFindScheduledTargetsInput): Promise<TApplicationAlertCertificate[]> => {
    if (!input.projectId || input.resourceId || !input.alreadyAlerted?.channelIds.length) return [];
    const { alertBefore, applicationIds, profileIds, sources } = ExpirationConditionSchema.parse(input.condition);

    return certManagerApplicationAlertDAL.findExpiringCertificates({
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

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TApplicationAlertCertificate[]> => {
    if (!input.projectId || input.resourceId) return [];
    const condition = EventConditionSchema.parse(input.condition);

    return certManagerApplicationAlertDAL.findCertificatesByIds({
      projectId: input.projectId,
      applicationIds: condition?.applicationIds,
      profileIds: condition?.profileIds,
      sources: condition?.sources,
      certificateIds: input.targetIds
    });
  };

  const buildPayload = (alert: TAlertContext, targets: TApplicationAlertCertificate[], viewUrl: string) =>
    buildCertificateAlertPayload({
      alert,
      targets,
      viewUrl,
      kind: ALERT_KIND_BY_EVENT[alert.eventType as CertificateManagerAlertEvent],
      webhookSource: getWebhookSource({ alertId: alert.id }),
      resourceOwnerKind: "Certificate Manager",
      applicationName: null
    });

  const getAuditEvent = (input: TAlertAuditInput) => {
    if (input.action === AlertAuditAction.TestChannel) {
      return buildCertificateManagerAlertAuditEvent(input, { applications: [], profiles: [], sources: [] });
    }
    const { applicationIds = [], profileIds = [], sources = [] } = parseFilters(input.alert.condition);
    const nameById = new Map(
      Object.values(input.alert.filters ?? {})
        .flat()
        .map((resource) => [resource.id, resource.name])
    );
    const withNames = (ids: string[]) => ids.map((id) => ({ id, name: nameById.get(id) ?? null }));
    return buildCertificateManagerAlertAuditEvent(input, {
      applications: withNames(applicationIds),
      profiles: withNames(profileIds),
      sources
    });
  };

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

    const { permission } = await getCertManagerAlertPermission(permissionService, { action, projectId, actor });

    const definesDelivery = action === AlertPermissionAction.Create || action === AlertPermissionAction.Edit;
    if (
      definesDelivery &&
      !isUnconditionalGrant(
        permission.rulesFor(ProjectPermissionCertificateActions.Read, ProjectPermissionSub.Certificates)
      )
    ) {
      throw new ForbiddenRequestError({
        message:
          "Certificate Manager alerts send certificate details from every application, so they require permission to read all certificates. Create the alert on an application instead."
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

    const previous = parseFilters(input.previousCondition);
    const savedApplicationIds = toIdSet(previous.applicationIds);
    const savedProfileIds = toIdSet(previous.profileIds);
    const addedApplicationIds = applicationIds.filter((id) => !savedApplicationIds.has(id.toLowerCase()));
    const addedProfileIds = profileIds.filter((id) => !savedProfileIds.has(id.toLowerCase()));

    const [foundApplicationIds, foundProfileIds]: string[][] = await Promise.all([
      addedApplicationIds.length
        ? certManagerApplicationAlertDAL.findProjectApplicationIds(input.projectId, addedApplicationIds)
        : [],
      addedProfileIds.length
        ? certManagerApplicationAlertDAL.findProjectProfileIds(input.projectId, addedProfileIds)
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
      certManagerApplicationAlertDAL.findApplicationNamesByIds(applicationIds, orgId),
      projectId ? certManagerApplicationAlertDAL.findProfileNamesByIds(projectId, profileIds) : []
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
      ...RELAYED_EVENTS.map(([key, sourceEventKey]) => ({
        key,
        triggerType: AlertTriggerType.Event,
        conditionSchema: EventConditionSchema,
        relayedFrom: { resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE, eventKey: sourceEventKey }
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
    getAuditEvent,
    getWebhookSource,
    getFilters,
    resolveProjectId: async ({ orgId, resourceId }) => {
      assertNoResource(resourceId);
      return resolveCertManagerProjectId(certManagerProjectResolver, orgId);
    }
  };
};
