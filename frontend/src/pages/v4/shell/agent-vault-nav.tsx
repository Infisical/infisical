import { type ReactNode, useMemo } from "react";
import { Badge } from "@infisical/cipher/ui/badge";

import {
  ProjectPermissionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { canManageAgentVaultSkills } from "@app/helpers/agentVaultPermissions";
import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";

import { useProjectPermission } from "../access/permissions";
import { useV4Adapter } from "../data/adapters";

const attention = (tone: "warn" | "bad") => (
  <Badge size="sm" tone={tone} icon="alert">
    <span className="sr-only">Needs attention</span>
  </Badge>
);

export const useAgentVaultNav = (orgId: string, projectId: string | undefined) => {
  const enabled = Boolean(projectId);
  const id = projectId ?? "";
  const { permission } = useProjectPermission(id);
  const canReadSettings =
    enabled && permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  const settingsAdapter = useV4Adapter("agentVaultSettings");
  const { data: grantedRequiringSetup } = useV4Adapter(
    "agentVault"
  ).useGrantedServicesRequiringSetupCount(orgId, id, enabled);
  const { data: sessionLogState } = settingsAdapter.useSessionLogSettings(
    orgId,
    id,
    canReadSettings
  );
  const { data: health } = settingsAdapter.useSessionLogHealth(orgId, id, canReadSettings);
  const { data: plan } = settingsAdapter.useSessionLogPlan(orgId);
  const canReadAccess =
    permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups) ||
    permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity);
  const canReadAudit = permission.can(
    ProjectPermissionAuditLogsActions.Read,
    ProjectPermissionSub.AuditLogs
  );
  const canManageSkills = canManageAgentVaultSkills(permission);
  const hidden = useMemo(
    () =>
      enabled
        ? (
            [
              ["access", canReadAccess],
              ["audit", canReadAudit],
              ["skills", canManageSkills],
              ["session-logs", canReadSettings]
            ] as const
          )
            .filter(([, isAllowed]) => !isAllowed)
            .map(([itemId]) => itemId)
        : [],
    [enabled, canReadAccess, canReadAudit, canManageSkills, canReadSettings]
  );
  if (!enabled) return { hidden, badges: {} };

  const settings = sessionLogState?.settings ?? null;
  let settingsAlert: ReactNode;
  if (health?.connectionError) settingsAlert = attention("bad");
  else if (
    (settings && !settings.enabled) ||
    (plan && isAgentVaultSessionLogBlockedByPlan(settings, plan))
  )
    settingsAlert = attention("warn");

  return {
    hidden,
    badges: {
      services: grantedRequiringSetup ? attention("warn") : undefined,
      settings: canReadSettings ? settingsAlert : undefined
    }
  };
};
