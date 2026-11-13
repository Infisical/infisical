import { MongoAbility } from "@casl/ability";

import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";

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
