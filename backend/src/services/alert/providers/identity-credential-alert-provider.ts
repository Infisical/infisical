import { ForbiddenError, subject } from "@casl/ability";
import RE2 from "re2";
import { z } from "zod";

import { ActionProjectType, OrganizationActionScope, ProjectType } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import {
  ALERT_SCAN_LEAD_DAYS,
  ALERT_SCAN_LEAD_INTERVAL,
  AlertPermissionAction,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IResourceAlertProvider,
  MAX_DEDUP_WINDOW_HOURS,
  TAlertContext,
  TAlertPermissionInput,
  TFindDueTargetsInput
} from "../alert-types";
import { TExpiringUaClientSecret, TIdentityCredentialAlertDALFactory } from "./identity-credential-alert-dal";

export const IDENTITY_AUTHENTICATION_RESOURCE_TYPE = "identity.authentication";
export const IDENTITY_AUTHENTICATION_EXPIRY_EVENT = "identity.authentication.expiry";

const alertBeforeRegex = new RE2("^\\d+d$");
const MIN_ALERT_BEFORE_DAYS = 1;
const MAX_ALERT_BEFORE_DAYS = 90;

const alertBeforeDays = (alertBefore: string): number => parseInt(alertBefore.slice(0, -1), 10);

const isValidAlertBefore = (alertBefore: string): boolean => {
  if (!alertBeforeRegex.test(alertBefore)) return false;
  const days = alertBeforeDays(alertBefore);
  return days >= MIN_ALERT_BEFORE_DAYS && days <= MAX_ALERT_BEFORE_DAYS;
};

const IdentityCredentialConditionSchema = z.object({
  alertBefore: z
    .string()
    .refine(
      isValidAlertBefore,
      `Must be a whole number of days from ${MIN_ALERT_BEFORE_DAYS}d to ${MAX_ALERT_BEFORE_DAYS}d, e.g. '30d'`
    ),
  dailyReminder: z.boolean().optional()
});

const DAILY_REPEAT_DEDUP_WINDOW_HOURS = 20;

type TIdentityCredentialTarget = { credentialType: "ua-client-secret" } & TExpiringUaClientSecret;

// "1d" -> "1 day", "30d" -> "30 days"
const humanizeAlertBefore = (alertBefore: string): string => {
  const days = alertBeforeDays(alertBefore);
  return `${days} day${days === 1 ? "" : "s"}`;
};

const daysUntil = (date: Date): number => Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const formatExpiry = (date: Date): string =>
  new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  });

const severityFor = (targets: TIdentityCredentialTarget[]): TAlertSeverity => {
  const minDays = Math.min(...targets.map((t) => daysUntil(t.expiresAt)));
  if (minDays <= 7) return "critical";
  if (minDays <= 14) return "error";
  if (minDays <= 30) return "warning";
  return "info";
};

const CREDENTIAL_TYPE_LABEL: Record<TIdentityCredentialTarget["credentialType"], string> = {
  "ua-client-secret": "Universal Auth Client Secret"
};

export type TIdentityCredentialAlertProviderDep = {
  identityCredentialAlertDAL: TIdentityCredentialAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
};

export const identityCredentialAlertProviderFactory = ({
  identityCredentialAlertDAL,
  permissionService
}: TIdentityCredentialAlertProviderDep): IResourceAlertProvider<TIdentityCredentialTarget> => {
  const projectBaseUrl = (
    siteUrl: string | undefined,
    orgId: string,
    projectType: string,
    projectId: string
  ): string => {
    switch (projectType) {
      case ProjectType.SecretManager:
        return `${siteUrl}/organizations/${orgId}/projects/secret-management/${projectId}`;
      case ProjectType.PAM:
        return `${siteUrl}/organizations/${orgId}/pam`;
      default:
        return `${siteUrl}/organizations/${orgId}/projects/${projectType}/${projectId}`;
    }
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const appCfg = getConfig();
    const siteUrl = appCfg.SITE_URL;

    if (alert.projectId) {
      const projectType = await identityCredentialAlertDAL.getProjectType(alert.projectId);
      if (projectType) {
        const base = projectBaseUrl(siteUrl, alert.orgId, projectType, alert.projectId);
        return alert.resourceId
          ? `${base}/identities/${alert.resourceId}`
          : `${base}/access-management?selectedTab=identities`;
      }
    }

    return alert.resourceId
      ? `${siteUrl}/organizations/${alert.orgId}/identities/${alert.resourceId}`
      : `${siteUrl}/organizations/${alert.orgId}/access-management?selectedTab=identities`;
  };

  const findDueTargets = async (input: TFindDueTargetsInput): Promise<TIdentityCredentialTarget[]> => {
    const { alertBefore } = IdentityCredentialConditionSchema.parse(input.condition);

    const uaSecrets = await identityCredentialAlertDAL.findExpiringUaClientSecrets({
      orgId: input.orgId,
      projectId: input.projectId,
      identityId: input.resourceId,
      alertBeforeInterval: `${alertBeforeDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf
    });

    return uaSecrets.map((secret) => ({ credentialType: "ua-client-secret" as const, ...secret }));
  };

  const buildPayload = (alert: TAlertContext, targets: TIdentityCredentialTarget[], viewUrl: string): TAlertPayload => {
    const alertBefore = (alert.condition as { alertBefore?: string } | null)?.alertBefore;

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        ...(alertBefore ? { condition: alertBefore } : {}),
        viewUrl
      },
      eventKey: IDENTITY_AUTHENTICATION_EXPIRY_EVENT,
      eventLabel: "Expiration",
      webhookType: "com.infisical.identity.authentication.expiration",
      resourceKind: "Machine Identity Authentication",
      resourceOwnerKind: "Machine Identity",
      severity: severityFor(targets),
      summary: alertBefore
        ? `${targets.length} machine identity authentication(s) expiring within ${humanizeAlertBefore(alertBefore)}`
        : `${targets.length} machine identity authentication(s) expiring`,
      items: targets.map((target) => ({
        id: `${target.credentialType}:${target.id}`,
        title: target.identityName,
        fields: [
          { label: "Secret Name", value: target.description || target.clientSecretPrefix },
          { label: "Secret Type", value: CREDENTIAL_TYPE_LABEL[target.credentialType] },
          { label: "Expires", value: formatExpiry(target.expiresAt) }
        ]
      }))
    };
  };

  const targetId = (target: TIdentityCredentialTarget): string => `${target.credentialType}:${target.id}`;

  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (!input.resourceId) return;

    const identity = await identityCredentialAlertDAL.findIdentityInOrg(input.resourceId, input.orgId);
    if (!identity) {
      throw new NotFoundError({ message: `Identity '${input.resourceId}' was not found in this organization` });
    }

    if (identity.projectId && identity.projectId !== input.projectId) {
      throw new ForbiddenRequestError({
        message: `Identity '${input.resourceId}' belongs to a project. Create this alert within that project so its identity permissions are enforced.`
      });
    }

    if (input.projectId) {
      const inProject = await identityCredentialAlertDAL.isIdentityInProject(input.resourceId, input.projectId);
      if (!inProject) {
        throw new NotFoundError({ message: `Identity '${input.resourceId}' is not a member of this project` });
      }
    }
  };

  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    const isRead = input.action === AlertPermissionAction.Read;
    const isDelete = input.action === AlertPermissionAction.Delete;
    const projectActions = (() => {
      if (isRead) return [ProjectPermissionIdentityActions.Read];
      if (isDelete) return [ProjectPermissionIdentityActions.Edit];
      return [ProjectPermissionIdentityActions.Edit, ProjectPermissionIdentityActions.Read];
    })();

    if (input.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: input.actor.actor,
        actorId: input.actor.actorId,
        projectId: input.projectId,
        actorAuthMethod: input.actor.actorAuthMethod,
        actorOrgId: input.actor.actorOrgId,
        actionProjectType: ActionProjectType.Any
      });

      for (const action of projectActions) {
        if (input.resourceId) {
          ForbiddenError.from(permission).throwUnlessCan(
            action,
            subject(ProjectPermissionSub.Identity, { identityId: input.resourceId })
          );
        } else {
          ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.Identity);
          const hasProjectWideGrant = permission
            .rulesFor(action, ProjectPermissionSub.Identity)
            .some((rule) => !rule.inverted && !rule.conditions);
          if (!hasProjectWideGrant) {
            throw new ForbiddenRequestError({
              message:
                "Project-wide identity permission is required to manage an alert that is not bound to a specific identity"
            });
          }
        }
      }
      return;
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: input.actor.actor,
      actorId: input.actor.actorId,
      orgId: input.orgId,
      actorAuthMethod: input.actor.actorAuthMethod,
      actorOrgId: input.actor.actorOrgId
    });
    const orgActions = (() => {
      if (isRead) return [OrgPermissionIdentityActions.Read];
      if (isDelete) return [OrgPermissionIdentityActions.Edit];
      return [OrgPermissionIdentityActions.Edit, OrgPermissionIdentityActions.Read];
    })();
    for (const action of orgActions) {
      ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.Identity);
    }
  };

  return {
    resourceType: IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
    eventTypes: [IDENTITY_AUTHENTICATION_EXPIRY_EVENT],
    conditionSchema: IdentityCredentialConditionSchema,
    findDueTargets,
    buildViewUrl,
    buildPayload,
    targetId,
    dedupWindowHours: (condition) => {
      const parsed = IdentityCredentialConditionSchema.safeParse(condition);
      if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
      if (parsed.data.dailyReminder) return DAILY_REPEAT_DEDUP_WINDOW_HOURS;
      return Math.min(
        MAX_DEDUP_WINDOW_HOURS,
        Math.max(DEFAULT_DEDUP_WINDOW_HOURS, (alertBeforeDays(parsed.data.alertBefore) + ALERT_SCAN_LEAD_DAYS) * 24)
      );
    },
    assertPermission,
    assertResourceInScope
  };
};
