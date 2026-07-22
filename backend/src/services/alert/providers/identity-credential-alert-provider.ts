import { ForbiddenError } from "@casl/ability";
import RE2 from "re2";
import { z } from "zod";

import { ActionProjectType, OrganizationActionScope, ProjectType } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import {
  AlertPermissionAction,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IResourceAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindDueTargetsInput
} from "../alert-types";
import { TExpiringUaClientSecret, TIdentityCredentialAlertDALFactory } from "./identity-credential-alert-dal";

export const IDENTITY_AUTHENTICATION_RESOURCE_TYPE = "identity.authentication";
export const IDENTITY_CREDENTIAL_EXPIRY_EVENT = "identity.credential.expiry";

const alertBeforeRegex = new RE2("^\\d+[dwmy]$");

const IdentityCredentialConditionSchema = z.object({
  alertBefore: z.string().refine((v) => alertBeforeRegex.test(v), "Must be in format like '30d', '1w', '3m', '1y'"),
  dailyReminder: z.boolean().optional()
});

const DAILY_REPEAT_DEDUP_WINDOW_HOURS = 20;

type TIdentityCredentialTarget = { credentialType: "ua-client-secret" } & TExpiringUaClientSecret;

const UNIT_TO_INTERVAL_WORD: Record<string, string> = { d: "days", w: "weeks", m: "months", y: "years" };
const UNIT_TO_UNIT_WORD: Record<string, string> = { d: "day", w: "week", m: "month", y: "year" };
const UNIT_TO_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

const parseAlertBefore = (alertBefore: string) => {
  const amount = parseInt(alertBefore.slice(0, -1), 10);
  const unit = alertBefore.slice(-1);
  return {
    intervalSql: `${amount} ${UNIT_TO_INTERVAL_WORD[unit]}`,
    days: amount * (UNIT_TO_DAYS[unit] ?? 1)
  };
};

// "1d" -> "1 day", "30d" -> "30 days", "1w" -> "1 week"
const humanizeAlertBefore = (alertBefore: string): string => {
  const amount = parseInt(alertBefore.slice(0, -1), 10);
  const unit = alertBefore.slice(-1);
  const word = UNIT_TO_UNIT_WORD[unit] ?? unit;
  return `${amount} ${word}${amount === 1 ? "" : "s"}`;
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
  const projectBaseUrl = (siteUrl: string, orgId: string, projectType: string, projectId: string): string => {
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
    const siteUrl = appCfg.SITE_URL ?? "https://app.infisical.com";

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
    const { intervalSql } = parseAlertBefore(alertBefore);

    const uaSecrets = await identityCredentialAlertDAL.findExpiringUaClientSecrets({
      orgId: input.orgId,
      projectId: input.projectId,
      identityId: input.resourceId,
      alertBeforeInterval: intervalSql
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
        resourceType: alert.resourceType,
        ...(alertBefore ? { condition: alertBefore } : {}),
        viewUrl
      },
      eventKey: IDENTITY_CREDENTIAL_EXPIRY_EVENT,
      eventLabel: "Expiration",
      webhookType: "com.infisical.identity.credential.expiration",
      resourceKind: "Identity Credential",
      severity: severityFor(targets),
      summary: alertBefore
        ? `${targets.length} identity credential(s) expiring within ${humanizeAlertBefore(alertBefore)}`
        : `${targets.length} identity credential(s) expiring`,
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

    const inOrg = await identityCredentialAlertDAL.isIdentityInOrg(input.resourceId, input.orgId);
    if (!inOrg) {
      throw new NotFoundError({ message: `Identity '${input.resourceId}' was not found in this organization` });
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

    if (input.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: input.actor.actor,
        actorId: input.actor.actorId,
        projectId: input.projectId,
        actorAuthMethod: input.actor.actorAuthMethod,
        actorOrgId: input.actor.actorOrgId,
        actionProjectType: ActionProjectType.Any
      });
      ForbiddenError.from(permission).throwUnlessCan(
        isRead ? ProjectPermissionIdentityActions.Read : ProjectPermissionIdentityActions.Edit,
        ProjectPermissionSub.Identity
      );
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
    ForbiddenError.from(permission).throwUnlessCan(
      isRead ? OrgPermissionIdentityActions.Read : OrgPermissionIdentityActions.Edit,
      OrgPermissionSubjects.Identity
    );
  };

  return {
    resourceType: IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
    eventTypes: [IDENTITY_CREDENTIAL_EXPIRY_EVENT],
    conditionSchema: IdentityCredentialConditionSchema,
    findDueTargets,
    buildViewUrl,
    buildPayload,
    targetId,
    dedupWindowHours: (condition) => {
      const parsed = IdentityCredentialConditionSchema.safeParse(condition);
      if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
      if (parsed.data.dailyReminder) return DAILY_REPEAT_DEDUP_WINDOW_HOURS;
      return Math.max(DEFAULT_DEDUP_WINDOW_HOURS, parseAlertBefore(parsed.data.alertBefore).days * 24);
    },
    assertPermission,
    assertResourceInScope
  };
};
