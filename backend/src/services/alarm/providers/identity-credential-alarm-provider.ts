import { ForbiddenError } from "@casl/ability";
import RE2 from "re2";
import { z } from "zod";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TAlarmPayload, TAlarmSeverity } from "../alarm-channel-types";
import {
  AlarmPermissionAction,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IResourceAlarmProvider,
  TAlarmContext,
  TAlarmPermissionInput,
  TFindDueTargetsInput
} from "../alarm-types";
import { TExpiringUaClientSecret, TIdentityCredentialAlarmDALFactory } from "./identity-credential-alarm-dal";

export const IDENTITY_CREDENTIAL_RESOURCE_TYPE = "identity.credential";
export const IDENTITY_CREDENTIAL_EXPIRY_EVENT = "identity.credential.expiry";

const alertBeforeRegex = new RE2("^\\d+[dwmy]$");

const IdentityCredentialConditionSchema = z.object({
  alertBefore: z.string().refine((v) => alertBeforeRegex.test(v), "Must be in format like '30d', '1w', '3m', '1y'")
});

type TIdentityCredentialTarget = { credentialType: "ua-client-secret" } & TExpiringUaClientSecret;

const UNIT_TO_INTERVAL_WORD: Record<string, string> = { d: "days", w: "weeks", m: "months", y: "years" };
const UNIT_TO_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

const parseAlertBefore = (alertBefore: string) => {
  const amount = parseInt(alertBefore.slice(0, -1), 10);
  const unit = alertBefore.slice(-1);
  return {
    intervalSql: `${amount} ${UNIT_TO_INTERVAL_WORD[unit]}`,
    days: amount * (UNIT_TO_DAYS[unit] ?? 1)
  };
};

const daysUntil = (date: Date): number => Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const severityFor = (targets: TIdentityCredentialTarget[]): TAlarmSeverity => {
  const minDays = Math.min(...targets.map((t) => daysUntil(t.expiresAt)));
  if (minDays <= 7) return "critical";
  if (minDays <= 14) return "error";
  if (minDays <= 30) return "warning";
  return "info";
};

const CREDENTIAL_TYPE_LABEL: Record<TIdentityCredentialTarget["credentialType"], string> = {
  "ua-client-secret": "Universal Auth Client Secret"
};

export type TIdentityCredentialAlarmProviderDep = {
  identityCredentialAlarmDAL: TIdentityCredentialAlarmDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
};

export const identityCredentialAlarmProviderFactory = ({
  identityCredentialAlarmDAL,
  permissionService
}: TIdentityCredentialAlarmProviderDep): IResourceAlarmProvider<TIdentityCredentialTarget> => {
  const buildViewUrl = (alarm: TAlarmContext): string => {
    const appCfg = getConfig();
    const base = `${appCfg.SITE_URL ?? "https://app.infisical.com"}/organizations/${alarm.orgId}/identities`;
    return alarm.resourceId ? `${base}/${alarm.resourceId}` : base;
  };

  const findDueTargets = async (input: TFindDueTargetsInput): Promise<TIdentityCredentialTarget[]> => {
    const { alertBefore } = IdentityCredentialConditionSchema.parse(input.condition);
    const { intervalSql } = parseAlertBefore(alertBefore);

    const uaSecrets = await identityCredentialAlarmDAL.findExpiringUaClientSecrets({
      orgId: input.orgId,
      identityId: input.resourceId,
      alertBeforeInterval: intervalSql
    });

    return uaSecrets.map((secret) => ({ credentialType: "ua-client-secret" as const, ...secret }));
  };

  const buildPayload = (alarm: TAlarmContext, targets: TIdentityCredentialTarget[]): TAlarmPayload => {
    const alertBefore = (alarm.condition as { alertBefore?: string } | null)?.alertBefore;
    const viewUrl = buildViewUrl(alarm);

    return {
      alarm: {
        id: alarm.id,
        name: alarm.name,
        orgId: alarm.orgId,
        resourceType: alarm.resourceType,
        ...(alertBefore ? { condition: alertBefore } : {}),
        viewUrl
      },
      eventKey: IDENTITY_CREDENTIAL_EXPIRY_EVENT,
      eventLabel: "Expiration",
      webhookType: "com.infisical.identity.credential.expiration",
      resourceKind: "Identity Credential",
      severity: severityFor(targets),
      summary: alertBefore
        ? `${targets.length} identity credential(s) expiring within ${alertBefore}`
        : `${targets.length} identity credential(s) expiring`,
      items: targets.map((target) => ({
        id: `${target.credentialType}:${target.id}`,
        title: `${CREDENTIAL_TYPE_LABEL[target.credentialType]} — ${target.identityName}`,
        identifier: target.description || target.clientSecretPrefix,
        fields: [
          { label: "Credential Type", value: CREDENTIAL_TYPE_LABEL[target.credentialType] },
          { label: "Identity", value: target.identityName },
          { label: "Expires", value: new Date(target.expiresAt).toISOString().split("T")[0] },
          { label: "Days Until Expiry", value: String(daysUntil(target.expiresAt)) }
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

    const inOrg = await identityCredentialAlarmDAL.isIdentityInOrg(input.resourceId, input.orgId);
    if (!inOrg) {
      throw new NotFoundError({ message: `Identity '${input.resourceId}' was not found in this organization` });
    }

    if (input.projectId) {
      const inProject = await identityCredentialAlarmDAL.isIdentityInProject(input.resourceId, input.projectId);
      if (!inProject) {
        throw new NotFoundError({ message: `Identity '${input.resourceId}' is not a member of this project` });
      }
    }
  };

  const assertPermission = async (input: TAlarmPermissionInput): Promise<void> => {
    const isRead = input.action === AlarmPermissionAction.Read;

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
    resourceType: IDENTITY_CREDENTIAL_RESOURCE_TYPE,
    eventTypes: [IDENTITY_CREDENTIAL_EXPIRY_EVENT],
    conditionSchema: IdentityCredentialConditionSchema,
    findDueTargets,
    buildPayload,
    targetId,
    dedupWindowHours: (condition) => {
      const parsed = IdentityCredentialConditionSchema.safeParse(condition);
      if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
      return Math.max(DEFAULT_DEDUP_WINDOW_HOURS, parseAlertBefore(parsed.data.alertBefore).days * 24);
    },
    assertPermission,
    assertResourceInScope
  };
};
