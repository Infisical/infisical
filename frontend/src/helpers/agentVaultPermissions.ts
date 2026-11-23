import { MongoAbility } from "@casl/ability";

import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

// A member reads the skills on bundles they reach from those bundles. The library lists every skill in the project, so
// it is for whoever can change it.
export const canManageAgentVaultSkills = (permission: MongoAbility<ProjectPermissionSet>) =>
  [
    ProjectPermissionAgentVaultSkillActions.Create,
    ProjectPermissionAgentVaultSkillActions.Edit,
    ProjectPermissionAgentVaultSkillActions.Delete
  ].some((action) => permission.can(action, ProjectPermissionSub.AgentVaultSkills));

// Services are written with Edit on access bundles, the check the API makes before any service change.
export const canManageAgentVaultServices = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Edit,
    ProjectPermissionSub.AgentVaultAccessBundles
  );

// The setup checklist walks through a proxy, a bundle, a service and the project's first session, and checks the last
// by listing everyone's sessions, so it is only for someone who can do all of that.
export const canSetUpAgentVault = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultProxyActions.Create,
    ProjectPermissionSub.AgentVaultProxies
  ) &&
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Create,
    ProjectPermissionSub.AgentVaultAccessBundles
  ) &&
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Edit,
    ProjectPermissionSub.AgentVaultAccessBundles
  ) &&
  permission.can(
    ProjectPermissionAgentVaultSessionActions.ReadAny,
    ProjectPermissionSub.AgentVaultSessions
  );

const SESSION_ACTIONS = {
  edit: [
    ProjectPermissionAgentVaultSessionActions.Edit,
    ProjectPermissionAgentVaultSessionActions.EditAny
  ],
  revoke: [
    ProjectPermissionAgentVaultSessionActions.Revoke,
    ProjectPermissionAgentVaultSessionActions.RevokeAny
  ]
} as const;

// The API takes the plain action for every session and the -any one on top for a session someone else owns. The
// dashboard always acts as a user, so a session is the caller's own when a user with their id holds it.
export const canActOnAgentVaultSession = (
  permission: MongoAbility<ProjectPermissionSet>,
  userId: string,
  session: Pick<TAgentVaultSession, "actor">,
  change: keyof typeof SESSION_ACTIONS
) => {
  const [own, any] = SESSION_ACTIONS[change];
  const isOwn = session.actor.type === AgentVaultMemberType.User && session.actor.id === userId;
  return (
    permission.can(own, ProjectPermissionSub.AgentVaultSessions) &&
    (isOwn || permission.can(any, ProjectPermissionSub.AgentVaultSessions))
  );
};
