import { ForbiddenError, MongoAbility } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType, ProjectMembershipRole, ResourceType } from "@app/db/schemas";
import { Event as TAuditEvent, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ResourcePermissionSub } from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CertificateAlertEvent,
  CodeSigningAlertEvent
} from "@app/services/certificate/certificate-alert-events";
import { getRevocationReasonLabel } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType, TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import { durationToDays, expirySeverity, formatUtcDate, humanizeDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertAuditAction,
  AlertPermissionAction,
  AlertTelemetryAction,
  AlertTriggerType,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IEventAlertProvider,
  IScheduledAlertProvider,
  TAlertAuditInput,
  TAlertContext,
  TAlertFilters,
  TAlertPermissionInput,
  TAlertTelemetryEvent,
  TAlertTelemetryInput,
  TFindEventTargetsInput,
  TFindScheduledTargetsInput
} from "../alert-types";
import {
  TApplicationAlertCertificate,
  TCertManagerApplicationAlertDALFactory
} from "./cert-manager-application-alert-dal";

const MAX_CERTIFICATE_ALERT_FILTER_IDS = 100;

type TCertManagerAlertEvent = CertificateAlertEvent | CodeSigningAlertEvent;

const toCertificateManagerEventKey = (eventType: TCertManagerAlertEvent) =>
  eventType.replace(`${CERT_MANAGER_APPLICATION_RESOURCE_TYPE}.`, "cert-manager.");

const isExpiryEvent = (eventType: TCertManagerAlertEvent) =>
  eventType === CertificateAlertEvent.Expiry || eventType === CodeSigningAlertEvent.SignerCertificateExpiry;

const TELEMETRY_ALERT_TYPE_BY_EVENT: Record<TCertManagerAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "expiration",
  [CertificateAlertEvent.Issuance]: "issuance",
  [CertificateAlertEvent.Renewal]: "renewal",
  [CertificateAlertEvent.Revocation]: "revocation",
  [CodeSigningAlertEvent.SignerCertificateExpiry]: "signer-certificate-expiration"
};

const MIN_CERTIFICATE_ALERT_BEFORE_DAYS = 1;
const MAX_CERTIFICATE_ALERT_BEFORE_DAYS = 365;

const isValidAlertBefore = (alertBefore: string): boolean => {
  const days = durationToDays(alertBefore);
  return days >= MIN_CERTIFICATE_ALERT_BEFORE_DAYS && days <= MAX_CERTIFICATE_ALERT_BEFORE_DAYS;
};

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
  profileIds: filterIdsSchema("profileIds", "profile")
});

const ExpiryFieldsSchema = z.object({
  alertBefore: z
    .string()
    .refine(
      isValidAlertBefore,
      `Must be a number of days, weeks, months or years adding up to ${MIN_CERTIFICATE_ALERT_BEFORE_DAYS} to ${MAX_CERTIFICATE_ALERT_BEFORE_DAYS} days, e.g. '30d' or '2w'`
    ),
  dailyReminder: z.boolean().optional()
});

const ExpirationConditionSchema = ExpiryFieldsSchema.merge(CertificateFilterSchema).strict();

const SignerExpirationConditionSchema = ExpiryFieldsSchema.strict(
  "Signer certificate expiration alerts cover every signer and take no filters. Remove applicationIds and profileIds."
);

const EventConditionSchema = CertificateFilterSchema.strict().nullish();

const assertValidApplicationId = (applicationId: string) => {
  if (!z.string().uuid().safeParse(applicationId).success) {
    throw new BadRequestError({ message: `Invalid application ID '${applicationId}': must be a UUID` });
  }
};

const EVENT_LABELS: Record<TCertManagerAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "Expiration",
  [CertificateAlertEvent.Issuance]: "Issuance",
  [CertificateAlertEvent.Renewal]: "Renewal",
  [CertificateAlertEvent.Revocation]: "Revocation",
  [CodeSigningAlertEvent.SignerCertificateExpiry]: "Expiration"
};

const EVENT_VERBS: Record<TCertManagerAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "is expiring",
  [CertificateAlertEvent.Issuance]: "was issued",
  [CertificateAlertEvent.Renewal]: "was renewed",
  [CertificateAlertEvent.Revocation]: "was revoked",
  [CodeSigningAlertEvent.SignerCertificateExpiry]: "is expiring"
};

const PERMISSION_ACTIONS: Record<AlertPermissionAction, ProjectPermissionActions> = {
  [AlertPermissionAction.Read]: ProjectPermissionActions.Read,
  [AlertPermissionAction.Create]: ProjectPermissionActions.Create,
  [AlertPermissionAction.Edit]: ProjectPermissionActions.Edit,
  [AlertPermissionAction.Delete]: ProjectPermissionActions.Delete
};

const eventSeverity = (eventType: TCertManagerAlertEvent, targets: TApplicationAlertCertificate[]): TAlertSeverity => {
  if (isExpiryEvent(eventType)) return expirySeverity(targets.map((target) => target.notAfter));
  if (eventType === CertificateAlertEvent.Revocation) return "warning";
  return "info";
};

const splitAltNames = (altNames: string | null): string[] =>
  (altNames ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

const certificateDisplayName = (certificate: TApplicationAlertCertificate): string =>
  certificate.commonName || splitAltNames(certificate.altNames)[0] || certificate.serialNumber;

const inApplication = (applicationName?: string | null) =>
  applicationName ? ` in application '${applicationName}'` : "";

const buildSummary = (
  eventType: TCertManagerAlertEvent,
  targets: TApplicationAlertCertificate[],
  applicationName: string | null,
  alertBefore?: string
): string => {
  if (alertBefore) {
    const noun = eventType === CodeSigningAlertEvent.SignerCertificateExpiry ? "signer certificate" : "certificate";
    const certificates = `${targets.length} ${noun}${targets.length === 1 ? "" : "s"}`;
    return `${certificates}${inApplication(applicationName)} expiring within ${humanizeDays(durationToDays(alertBefore))}`;
  }
  if (targets.length === 1) {
    return `Certificate '${certificateDisplayName(targets[0])}' ${EVENT_VERBS[eventType]}${inApplication(targets[0].applicationName)}`;
  }
  return `${targets.length} certificates ${EVENT_VERBS[eventType]}${inApplication(applicationName)}`;
};

const formatSigners = (signerNames: string[] = []) =>
  `${signerNames.length === 1 ? "signer" : "signers"} ${signerNames.map((name) => `'${name}'`).join(", ")}`;

const buildItemSummary = (eventType: TCertManagerAlertEvent, certificate: TApplicationAlertCertificate): string => {
  if (eventType === CodeSigningAlertEvent.SignerCertificateExpiry) {
    return `Certificate '${certificateDisplayName(certificate)}' of ${formatSigners(certificate.signerNames)} expires on ${formatUtcDate(certificate.notAfter)}`;
  }
  if (eventType === CertificateAlertEvent.Expiry) {
    return `Certificate '${certificateDisplayName(certificate)}'${inApplication(certificate.applicationName)} expires on ${formatUtcDate(certificate.notAfter)}`;
  }
  return `Certificate '${certificateDisplayName(certificate)}' ${EVENT_VERBS[eventType]}${inApplication(certificate.applicationName)}`;
};

const DAILY_SCAN_DEDUP_MARGIN_HOURS = 4;

const dayMultipleDedupWindowHours = (days: number): number => days * 24 - DAILY_SCAN_DEDUP_MARGIN_HOURS;

const expirationDedupWindowHours = (days: number, dailyReminder?: boolean): number => {
  if (dailyReminder || days <= 7) return dayMultipleDedupWindowHours(1);
  if (days <= 30) return dayMultipleDedupWindowHours(2);
  if (days <= 90) return dayMultipleDedupWindowHours(7);
  return dayMultipleDedupWindowHours(30);
};

const formatIds = (ids: string[]) => ids.map((id) => `'${id}'`).join(", ");

const toIdSet = (ids: string[] = []) => new Set(ids.map((id) => id.toLowerCase()));

const parseFilters = (condition: unknown) => {
  const filters = CertificateFilterSchema.safeParse(condition ?? {});
  return filters.success ? filters.data : {};
};

const isUnconditionalGrant = (rules: ReturnType<MongoAbility<ProjectPermissionSet>["rulesFor"]>) =>
  rules.some((rule) => !rule.inverted && !rule.conditions) && !rules.some((rule) => rule.inverted);

export type TCertManagerApplicationAlertProviderDep = {
  certManagerApplicationAlertDAL: TCertManagerApplicationAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">;
};

export const certManagerApplicationAlertProviderFactory = ({
  certManagerApplicationAlertDAL,
  permissionService,
  licenseService,
  certManagerProjectResolver
}: TCertManagerApplicationAlertProviderDep): IScheduledAlertProvider<TApplicationAlertCertificate> &
  IEventAlertProvider<TApplicationAlertCertificate> => {
  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const base = `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}`;
    if (alert.eventType === CodeSigningAlertEvent.SignerCertificateExpiry) return `${base}/code-signing`;
    if (!alert.resourceId) return `${base}/inventory`;
    const application = await certManagerApplicationAlertDAL.findApplicationById(alert.resourceId);
    return application ? `${base}/applications/${encodeURIComponent(application.name)}` : `${base}/applications`;
  };

  const findScheduledTargets = async (input: TFindScheduledTargetsInput): Promise<TApplicationAlertCertificate[]> => {
    if (!input.projectId) return [];
    if (input.eventType === CodeSigningAlertEvent.SignerCertificateExpiry) {
      if (input.resourceId) return [];
      const { alertBefore } = SignerExpirationConditionSchema.parse(input.condition);
      return certManagerApplicationAlertDAL.findExpiringSignerCertificates({
        projectId: input.projectId,
        alertBeforeInterval: `${durationToDays(alertBefore)} days`,
        leadInterval: ALERT_SCAN_LEAD_INTERVAL,
        asOf: input.asOf,
        alreadyAlerted: input.alreadyAlerted
      });
    }
    const { alertBefore, applicationIds, profileIds } = ExpirationConditionSchema.parse(input.condition);

    return certManagerApplicationAlertDAL.findExpiringCertificates({
      projectId: input.projectId,
      applicationId: input.resourceId,
      applicationIds,
      profileIds,
      alertBeforeInterval: `${durationToDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf,
      alreadyAlerted: input.alreadyAlerted
    });
  };

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TApplicationAlertCertificate[]> => {
    if (!input.projectId) return [];
    const condition = EventConditionSchema.parse(input.condition);

    return certManagerApplicationAlertDAL.findCertificatesByIds({
      projectId: input.projectId,
      applicationId: input.resourceId,
      applicationIds: condition?.applicationIds,
      profileIds: condition?.profileIds,
      certificateIds: input.targetIds
    });
  };

  const getWebhookSource = ({ alertId, resourceId }: { alertId: string; resourceId?: string | null }) =>
    resourceId ? `/applications/${resourceId}/alerts/${alertId}` : `/alerts/${alertId}`;

  const buildPayload = (
    alert: TAlertContext,
    targets: TApplicationAlertCertificate[],
    viewUrl: string
  ): TAlertPayload => {
    const eventType = alert.eventType as TCertManagerAlertEvent;
    const isApplicationAlert = Boolean(alert.resourceId);
    const isSignerAlert = eventType === CodeSigningAlertEvent.SignerCertificateExpiry;
    const deliveryEventKey = isApplicationAlert ? eventType : toCertificateManagerEventKey(eventType);
    const alertBefore = isExpiryEvent(eventType)
      ? (alert.condition as { alertBefore?: string } | null)?.alertBefore
      : undefined;

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        ...(alert.resourceId ? { resourceId: alert.resourceId } : {}),
        ...(alertBefore ? { condition: alertBefore } : {}),
        viewUrl
      },
      eventKey: deliveryEventKey,
      eventLabel: EVENT_LABELS[eventType],
      webhookType: `com.infisical.${deliveryEventKey}`,
      webhookSource: getWebhookSource({ alertId: alert.id, resourceId: alert.resourceId }),
      resourceKind: isSignerAlert ? "Signer Certificate" : "Certificate",
      resourceOwnerKind: isApplicationAlert ? "Application" : "Certificate Manager",
      severity: eventSeverity(eventType, targets),
      summary: buildSummary(
        eventType,
        targets,
        isApplicationAlert ? (targets[0]?.applicationName ?? null) : null,
        alertBefore
      ),
      items: targets.map((certificate) => {
        const revocationReason =
          eventType === CertificateAlertEvent.Revocation
            ? getRevocationReasonLabel(certificate.revocationReason)
            : undefined;
        const altNames = splitAltNames(certificate.altNames);
        return {
          id: certificate.id,
          title: certificateDisplayName(certificate),
          summary: buildItemSummary(eventType, certificate),
          severity: eventSeverity(eventType, [certificate]),
          fields: [
            ...(isSignerAlert && certificate.signerNames?.length
              ? [
                  {
                    label: certificate.signerNames.length === 1 ? "Signer" : "Signers",
                    value: certificate.signerNames.join(", ")
                  }
                ]
              : []),
            { label: "Serial Number", value: certificate.serialNumber },
            ...(altNames.length ? [{ label: "SANs", value: altNames.join(", ") }] : []),
            ...(certificate.profileName ? [{ label: "Profile", value: certificate.profileName }] : []),
            ...(!isApplicationAlert && certificate.applicationName
              ? [{ label: "Application", value: certificate.applicationName }]
              : []),
            { label: "Expires", value: formatUtcDate(certificate.notAfter) },
            ...(revocationReason ? [{ label: "Revocation Reason", value: revocationReason }] : [])
          ],
          resource: {
            id: certificate.id,
            serialNumber: certificate.serialNumber,
            commonName: certificate.commonName,
            altNames,
            status: certificate.status,
            notBefore: certificate.notBefore.toISOString(),
            notAfter: certificate.notAfter.toISOString(),
            revokedAt: certificate.revokedAt?.toISOString() ?? null,
            revocationReason: certificate.revocationReason,
            profileId: certificate.profileId,
            profileName: certificate.profileName,
            applicationId: certificate.applicationId,
            applicationName: certificate.applicationName,
            ...(isSignerAlert ? { signerIds: certificate.signerIds, signerNames: certificate.signerNames } : {})
          }
        };
      })
    };
  };

  const getCertificateManagerAuditEvent = (input: TAlertAuditInput): TAuditEvent => {
    if (input.action === AlertAuditAction.TestChannel) {
      const { test } = input;
      return {
        type: EventType.TEST_CERTIFICATE_MANAGER_ALERT_CHANNEL,
        metadata: {
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

    const { alert } = input;
    const { applicationIds = [], profileIds = [] } = parseFilters(alert.condition);
    const nameById = new Map(
      Object.values(alert.filters ?? {})
        .flat()
        .map((resource) => [resource.id, resource.name])
    );
    const withNames = (ids: string[]) => ids.map((id) => ({ id, name: nameById.get(id) ?? null }));
    const metadata = {
      alertId: alert.id,
      name: alert.name,
      eventType: alert.eventType,
      applications: withNames(applicationIds),
      profiles: withNames(profileIds)
    };
    if (input.action === AlertAuditAction.Create) return { type: EventType.CREATE_CERTIFICATE_MANAGER_ALERT, metadata };
    if (input.action === AlertAuditAction.Update) return { type: EventType.UPDATE_CERTIFICATE_MANAGER_ALERT, metadata };
    return { type: EventType.DELETE_CERTIFICATE_MANAGER_ALERT, metadata };
  };

  const getAuditEvent = (input: TAlertAuditInput): TAuditEvent => {
    const resourceId = input.action === AlertAuditAction.TestChannel ? input.test.resourceId : input.alert.resourceId;
    if (!resourceId) return getCertificateManagerAuditEvent(input);

    if (input.action === AlertAuditAction.TestChannel) {
      const { test } = input;
      return {
        type: EventType.TEST_PKI_APPLICATION_ALERT_CHANNEL,
        metadata: {
          applicationId: resourceId,
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
      applicationId: resourceId,
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
    if (!projectId) return undefined;
    const properties = {
      orgId,
      projectId,
      ...(resourceId
        ? { applicationId: resourceId, alertScope: PkiAlertScope.Application }
        : { alertScope: PkiAlertScope.CertificateManager })
    };
    switch (action) {
      case AlertTelemetryAction.Create:
        return {
          event: PostHogEventTypes.PkiAlertCreated,
          properties: {
            ...properties,
            alertType: TELEMETRY_ALERT_TYPE_BY_EVENT[eventType as TCertManagerAlertEvent]
          }
        };
      case AlertTelemetryAction.Update:
        return { event: PostHogEventTypes.PkiAlertUpdated, properties };
      default:
        return { event: PostHogEventTypes.PkiAlertDeleted, properties };
    }
  };

  const $assertCertificateManagerPermission = async ({
    action,
    projectId,
    eventType,
    actor
  }: TAlertPermissionInput & { projectId: string }) => {
    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor: actor.actor,
      actorId: actor.actorId,
      projectId,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(PERMISSION_ACTIONS[action], ProjectPermissionSub.PkiAlerts);

    const definesDelivery = action === AlertPermissionAction.Create || action === AlertPermissionAction.Edit;
    if (!definesDelivery) return;

    if (eventType === CodeSigningAlertEvent.SignerCertificateExpiry) {
      if (!hasRole(ProjectMembershipRole.Admin)) {
        throw new ForbiddenRequestError({
          message:
            "Signer certificate expiration alerts send certificate details from every signer, so only Certificate Manager admins can create or edit them."
        });
      }
      return;
    }

    if (
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

  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    const { action, projectId, resourceId, eventType, actor } = input;
    if (!projectId) {
      throw new BadRequestError({ message: "Certificate alerts must be created in Certificate Manager" });
    }

    if (resourceId && eventType === CodeSigningAlertEvent.SignerCertificateExpiry) {
      throw new BadRequestError({
        message:
          "Signer certificate expiration alerts cover every signer in Certificate Manager and can't be bound to an application. Remove resourceId."
      });
    }

    if (!resourceId) {
      await $assertCertificateManagerPermission({ ...input, projectId });
      return;
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
    ForbiddenError.from(permission).throwUnlessCan(PERMISSION_ACTIONS[action], ResourcePermissionSub.PkiAlerts);
  };

  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (!input.resourceId) return;
    assertValidApplicationId(input.resourceId);

    const application = await certManagerApplicationAlertDAL.findApplicationById(input.resourceId);
    if (!application || application.orgId !== input.orgId || application.projectId !== input.projectId) {
      throw new NotFoundError({
        message: `Application with ID '${input.resourceId}' not found in Certificate Manager`
      });
    }
  };

  const assertConditionInScope = async (input: {
    projectId?: string | null;
    resourceId?: string | null;
    condition: unknown;
    previousCondition?: unknown;
  }): Promise<void> => {
    if (!input.projectId) return;
    const { applicationIds = [], profileIds = [] } = CertificateFilterSchema.parse(input.condition ?? {});
    if (input.resourceId && (applicationIds.length || profileIds.length)) {
      throw new BadRequestError({
        message:
          "Application alerts already cover a single application. Remove applicationIds and profileIds, or create a Certificate Manager alert instead."
      });
    }

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

  const resolveProjectId = async ({ orgId, resourceId }: { orgId: string; resourceId?: string | null }) => {
    if (!resourceId) {
      const projectId = await certManagerProjectResolver.getActiveProjectId(orgId);
      if (!projectId) {
        throw new NotFoundError({ message: "Certificate Manager isn't set up for this organization" });
      }
      return projectId;
    }
    assertValidApplicationId(resourceId);
    const application = await certManagerApplicationAlertDAL.findApplicationById(resourceId);
    if (!application || application.orgId !== orgId) {
      throw new NotFoundError({ message: `Application with ID '${resourceId}' not found` });
    }
    return application.projectId;
  };

  const assertChannelTypesAllowed = async ({ orgId, channelTypes }: { orgId: string; channelTypes: string[] }) => {
    const gatedType = channelTypes.find((channelType) => channelType !== AlertChannelType.EMAIL);
    if (!gatedType) return;

    const plan = await licenseService.getPlan(orgId);
    if (!plan.pkiEnterpriseAlerting) {
      throw new BadRequestError({
        message: `Failed to save a ${gatedType} channel due to plan restriction. Upgrade plan to alert on channels other than email, or disable or remove the ${gatedType} channel.`
      });
    }
  };

  return {
    resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
    supportsScopeWideAlerts: true,
    events: [
      {
        key: CertificateAlertEvent.Expiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: ExpirationConditionSchema
      },
      {
        key: CodeSigningAlertEvent.SignerCertificateExpiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: SignerExpirationConditionSchema
      },
      ...[CertificateAlertEvent.Issuance, CertificateAlertEvent.Renewal, CertificateAlertEvent.Revocation].map(
        (key) => ({
          key,
          triggerType: AlertTriggerType.Event,
          conditionSchema: EventConditionSchema
        })
      )
    ],
    findScheduledTargets,
    findEventTargets,
    buildViewUrl,
    buildPayload,
    getTelemetryEvent,
    targetId: (certificate) => certificate.id,
    dedupWindowHours: (condition) => {
      const parsed = ExpirationConditionSchema.safeParse(condition);
      if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
      return expirationDedupWindowHours(durationToDays(parsed.data.alertBefore), parsed.data.dailyReminder);
    },
    assertPermission,
    assertResourceInScope,
    assertConditionInScope,
    assertChannelTypesAllowed,
    recipientPolicy: { atOrgScope: true, allowEmailAddresses: true },
    includeLastRun: true,
    getAuditEvent,
    getWebhookSource,
    getFilters,
    resolveProjectId,
    getResourceNames: async ({ orgId, resourceIds }) =>
      new Map(
        (await certManagerApplicationAlertDAL.findApplicationNamesByIds(resourceIds, orgId)).map((app) => [
          app.id,
          app.name
        ])
      )
  };
};
