import { ForbiddenError, subject } from "@casl/ability";
import RE2 from "re2";
import { z } from "zod";

import { ActionProjectType, IdentityAuthMethod, OrganizationActionScope, ProjectType } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import {
  IDENTITY_AUTH_METHOD_CHANGED_EVENT,
  IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
  IdentityAuthMethodChange,
  IdentityAuthMethodChangePayloadSchema
} from "@app/services/identity/identity-auth-method-events";

import { TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import {
  ALERT_SCAN_LEAD_DAYS,
  ALERT_SCAN_LEAD_INTERVAL,
  AlertPermissionAction,
  AlertTriggerType,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IEventAlertProvider,
  IScheduledAlertProvider,
  MAX_DEDUP_WINDOW_HOURS,
  TAlertContext,
  TAlertPermissionInput,
  TFindDueTargetsInput,
  TFindTargetsByIdsInput
} from "../alert-types";
import { TExpiringUaClientSecret, TIdentityCredentialAlertDALFactory } from "./identity-credential-alert-dal";

export { IDENTITY_AUTH_METHOD_CHANGED_EVENT, IDENTITY_AUTHENTICATION_RESOURCE_TYPE };

export const IDENTITY_AUTHENTICATION_EXPIRY_EVENT = "identity.authentication.expiry";

const IdentityAuthMethodChangeConditionSchema = z.object({}).nullish();

const IDENTITY_AUTH_METHOD_LABELS: Record<IdentityAuthMethod, string> = {
  [IdentityAuthMethod.TOKEN_AUTH]: "Token Auth",
  [IdentityAuthMethod.UNIVERSAL_AUTH]: "Universal Auth",
  [IdentityAuthMethod.KUBERNETES_AUTH]: "Kubernetes Auth",
  [IdentityAuthMethod.GCP_AUTH]: "GCP Auth",
  [IdentityAuthMethod.ALICLOUD_AUTH]: "Alibaba Cloud Auth",
  [IdentityAuthMethod.AWS_AUTH]: "AWS Auth",
  [IdentityAuthMethod.AZURE_AUTH]: "Azure Auth",
  [IdentityAuthMethod.TLS_CERT_AUTH]: "TLS Certificate Auth",
  [IdentityAuthMethod.OCI_AUTH]: "OCI Auth",
  [IdentityAuthMethod.OIDC_AUTH]: "OIDC Auth",
  [IdentityAuthMethod.JWT_AUTH]: "JWT Auth",
  [IdentityAuthMethod.LDAP_AUTH]: "LDAP Auth",
  [IdentityAuthMethod.SPIFFE_AUTH]: "SPIFFE Auth"
};

const AUTH_METHOD_CHANGE_LABEL: Record<IdentityAuthMethodChange, string> = {
  [IdentityAuthMethodChange.Added]: "Added",
  [IdentityAuthMethodChange.Updated]: "Updated",
  [IdentityAuthMethodChange.Removed]: "Removed",
  [IdentityAuthMethodChange.CredentialAdded]: "Credential Added",
  [IdentityAuthMethodChange.CredentialUpdated]: "Credential Updated",
  [IdentityAuthMethodChange.CredentialRevoked]: "Credential Revoked"
};

const AUTH_METHOD_CHANGE_VERB: Record<IdentityAuthMethodChange, string> = {
  [IdentityAuthMethodChange.Added]: "was added to",
  [IdentityAuthMethodChange.Updated]: "was updated on",
  [IdentityAuthMethodChange.Removed]: "was removed from",
  [IdentityAuthMethodChange.CredentialAdded]: "was added to",
  [IdentityAuthMethodChange.CredentialUpdated]: "was updated on",
  [IdentityAuthMethodChange.CredentialRevoked]: "was revoked from"
};

const CREDENTIAL_KIND_LABEL: Partial<Record<IdentityAuthMethod, string>> = {
  [IdentityAuthMethod.UNIVERSAL_AUTH]: "client secret",
  [IdentityAuthMethod.TOKEN_AUTH]: "token"
};

const isCredentialChange = (change: IdentityAuthMethodChange): boolean =>
  change === IdentityAuthMethodChange.CredentialAdded ||
  change === IdentityAuthMethodChange.CredentialUpdated ||
  change === IdentityAuthMethodChange.CredentialRevoked;

const describeSubject = (target: TAuthMethodChangeTarget): string => {
  const method = IDENTITY_AUTH_METHOD_LABELS[target.authMethod];
  if (!isCredentialChange(target.change)) return method;
  const kind = CREDENTIAL_KIND_LABEL[target.authMethod] ?? "credential";
  return target.credentialName ? `${method} ${kind} '${target.credentialName}'` : `${method} ${kind}`;
};

const ACTOR_TYPE_LABEL: Partial<Record<ActorType, string>> = {
  [ActorType.USER]: "user",
  [ActorType.IDENTITY]: "machine identity",
  [ActorType.PLATFORM]: "Infisical",
  [ActorType.SCIM_CLIENT]: "SCIM client"
};

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

type TExpiringCredentialTarget = {
  kind: "expiring-credential";
  credentialType: "ua-client-secret";
} & TExpiringUaClientSecret;

type TAuthMethodChangeTarget = {
  kind: "auth-method-change";
  identityId: string;
  identityName: string;
  authMethod: IdentityAuthMethod;
  change: IdentityAuthMethodChange;
  actorLabel: string;
  changedAt: Date;
  credentialId?: string;
  credentialName?: string;
};

type TIdentityCredentialTarget = TExpiringCredentialTarget | TAuthMethodChangeTarget;

// "1d" -> "1 day", "30d" -> "30 days"
const humanizeAlertBefore = (alertBefore: string): string => {
  const days = alertBeforeDays(alertBefore);
  return `${days} day${days === 1 ? "" : "s"}`;
};

const daysUntil = (date: Date): number => Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const formatUtcDate = (date: Date): string =>
  new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  });

const severityFor = (targets: TExpiringCredentialTarget[]): TAlertSeverity => {
  const minDays = Math.min(...targets.map((t) => daysUntil(t.expiresAt)));
  if (minDays <= 7) return "critical";
  if (minDays <= 14) return "error";
  if (minDays <= 30) return "warning";
  return "info";
};

const CREDENTIAL_TYPE_LABEL: Record<TExpiringCredentialTarget["credentialType"], string> = {
  "ua-client-secret": "Universal Auth Client Secret"
};

export type TIdentityCredentialAlertProviderDep = {
  identityCredentialAlertDAL: TIdentityCredentialAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
};

const targetId = (target: TIdentityCredentialTarget): string =>
  target.kind === "auth-method-change"
    ? [
        "auth-method-change",
        target.identityId,
        target.authMethod,
        target.change,
        ...(target.credentialId ? [target.credentialId] : [])
      ].join(":")
    : `${target.credentialType}:${target.id}`;

export const identityCredentialAlertProviderFactory = ({
  identityCredentialAlertDAL,
  permissionService
}: TIdentityCredentialAlertProviderDep): IScheduledAlertProvider<TIdentityCredentialTarget> &
  IEventAlertProvider<TIdentityCredentialTarget> => {
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

    return uaSecrets.map((secret) => ({
      kind: "expiring-credential" as const,
      credentialType: "ua-client-secret" as const,
      ...secret
    }));
  };

  const resolveActorLabel = async (orgId: string, actorType: ActorType, actorId?: string): Promise<string> => {
    const typeLabel = ACTOR_TYPE_LABEL[actorType] ?? actorType;
    if (!actorId) return typeLabel;

    if (actorType === ActorType.USER) {
      const label = await identityCredentialAlertDAL.findUserLabelById(actorId);
      return label ? `${label} (user)` : typeLabel;
    }
    if (actorType === ActorType.IDENTITY) {
      const [identity] = await identityCredentialAlertDAL.findIdentitiesByIds([actorId], orgId);
      return identity ? `${identity.name} (machine identity)` : typeLabel;
    }
    return typeLabel;
  };

  const findTargetsByIds = async (input: TFindTargetsByIdsInput): Promise<TIdentityCredentialTarget[]> => {
    if (input.eventType !== IDENTITY_AUTH_METHOD_CHANGED_EVENT) return [];

    const parsed = IdentityAuthMethodChangePayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Unreadable '${IDENTITY_AUTH_METHOD_CHANGED_EVENT}' payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join(", ")}`
      );
    }
    const change = parsed.data;

    const identities = await identityCredentialAlertDAL.findIdentitiesByIds(input.targetIds, input.orgId);
    if (identities.length === 0) return [];

    const actorLabel = await resolveActorLabel(input.orgId, change.actorType, change.actorId);

    return identities.map((identity) => ({
      kind: "auth-method-change" as const,
      identityId: identity.id,
      identityName: identity.name,
      authMethod: change.authMethod,
      change: change.change,
      actorLabel,
      changedAt: change.changedAt,
      ...(change.credentialId ? { credentialId: change.credentialId } : {}),
      ...(change.credentialName ? { credentialName: change.credentialName } : {})
    }));
  };

  const buildAlertBlock = (alert: TAlertContext, viewUrl: string, condition?: string): TAlertPayload["alert"] => ({
    id: alert.id,
    name: alert.name,
    orgId: alert.orgId,
    ...(alert.projectId ? { projectId: alert.projectId } : {}),
    resourceType: alert.resourceType,
    ...(condition ? { condition } : {}),
    viewUrl
  });

  const buildAuthMethodChangePayload = (
    alert: TAlertContext,
    targets: TAuthMethodChangeTarget[],
    viewUrl: string
  ): TAlertPayload => {
    const [first] = targets;
    const summary =
      targets.length === 1
        ? `${describeSubject(first)} ${AUTH_METHOD_CHANGE_VERB[first.change]} machine identity '${first.identityName}'`
        : `${targets.length} machine identity auth method changes`;

    return {
      alert: buildAlertBlock(alert, viewUrl),
      eventKey: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      eventLabel: "Auth Method Change",
      webhookType: "com.infisical.identity.authentication.auth-method-changed",
      resourceKind: "Machine Identity Authentication",
      resourceOwnerKind: "Machine Identity",
      severity: "warning",
      summary,
      items: targets.map((target) => ({
        id: targetId(target),
        title: target.identityName,
        fields: [
          { label: "Auth Method", value: IDENTITY_AUTH_METHOD_LABELS[target.authMethod] },
          { label: "Change", value: AUTH_METHOD_CHANGE_LABEL[target.change] },
          ...(target.credentialName ? [{ label: "Credential", value: target.credentialName }] : []),
          { label: "Changed By", value: target.actorLabel },
          { label: "Changed At", value: formatUtcDate(target.changedAt) }
        ]
      }))
    };
  };

  const buildExpiryPayload = (
    alert: TAlertContext,
    targets: TExpiringCredentialTarget[],
    viewUrl: string
  ): TAlertPayload => {
    const alertBefore = (alert.condition as { alertBefore?: string } | null)?.alertBefore;

    return {
      alert: buildAlertBlock(alert, viewUrl, alertBefore),
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
        id: targetId(target),
        title: target.identityName,
        fields: [
          { label: "Secret Name", value: target.description || target.clientSecretPrefix },
          { label: "Secret Type", value: CREDENTIAL_TYPE_LABEL[target.credentialType] },
          { label: "Expires", value: formatUtcDate(target.expiresAt) }
        ]
      }))
    };
  };

  const buildPayload = (alert: TAlertContext, targets: TIdentityCredentialTarget[], viewUrl: string): TAlertPayload => {
    if (alert.eventType === IDENTITY_AUTH_METHOD_CHANGED_EVENT) {
      return buildAuthMethodChangePayload(
        alert,
        targets.filter((target): target is TAuthMethodChangeTarget => target.kind === "auth-method-change"),
        viewUrl
      );
    }
    return buildExpiryPayload(
      alert,
      targets.filter((target): target is TExpiringCredentialTarget => target.kind === "expiring-credential"),
      viewUrl
    );
  };

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
    events: [
      {
        key: IDENTITY_AUTHENTICATION_EXPIRY_EVENT,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: IdentityCredentialConditionSchema
      },
      {
        key: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
        triggerType: AlertTriggerType.Event,
        conditionSchema: IdentityAuthMethodChangeConditionSchema
      }
    ],
    findDueTargets,
    findTargetsByIds,
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
