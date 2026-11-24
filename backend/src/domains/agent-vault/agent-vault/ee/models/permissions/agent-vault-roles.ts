import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionAppConnectionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";

// The admin set is written out rather than aliased to projectAdminPermissions: an Agent Vault admin has
// no business rotating CMEKs or minting service tokens.
const buildAgentVaultProjectAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionAgentVaultAccessBundleActions.Create,
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionAgentVaultAccessBundleActions.Delete,
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers
    ],
    ProjectPermissionSub.AgentVaultAccessBundles
  );

  can(
    [
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionAgentVaultSessionActions.ReadAny,
      ProjectPermissionAgentVaultSessionActions.EditAny,
      ProjectPermissionAgentVaultSessionActions.RevokeAny,
      ProjectPermissionAgentVaultSessionActions.CreateWithInlineServices,
      ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills
    ],
    ProjectPermissionSub.AgentVaultSessions
  );

  can(
    [
      ProjectPermissionAgentVaultProxyActions.Read,
      ProjectPermissionAgentVaultProxyActions.Create,
      ProjectPermissionAgentVaultProxyActions.Edit,
      ProjectPermissionAgentVaultProxyActions.Delete,
      ProjectPermissionAgentVaultProxyActions.IssueToken,
      ProjectPermissionAgentVaultProxyActions.Revoke
    ],
    ProjectPermissionSub.AgentVaultProxies
  );

  can(
    [
      ProjectPermissionAgentVaultSkillActions.Read,
      ProjectPermissionAgentVaultSkillActions.Create,
      ProjectPermissionAgentVaultSkillActions.Edit,
      ProjectPermissionAgentVaultSkillActions.Delete
    ],
    ProjectPermissionSub.AgentVaultSkills
  );

  can(
    [
      ProjectPermissionAgentVaultHookActions.Read,
      ProjectPermissionAgentVaultHookActions.Create,
      ProjectPermissionAgentVaultHookActions.Edit,
      ProjectPermissionAgentVaultHookActions.Delete
    ],
    ProjectPermissionSub.AgentVaultHooks
  );

  can(
    [
      ProjectPermissionAgentVaultVariableActions.Read,
      ProjectPermissionAgentVaultVariableActions.Create,
      ProjectPermissionAgentVaultVariableActions.Edit,
      ProjectPermissionAgentVaultVariableActions.Delete,
      ProjectPermissionAgentVaultVariableActions.ReadValue
    ],
    ProjectPermissionSub.AgentVaultVariables
  );

  can(
    [
      ProjectPermissionAppConnectionActions.Read,
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionAppConnectionActions.Edit,
      ProjectPermissionAppConnectionActions.Delete,
      ProjectPermissionAppConnectionActions.Connect
    ],
    ProjectPermissionSub.AppConnections
  );

  can(
    [
      ProjectPermissionMemberActions.Create,
      ProjectPermissionMemberActions.Edit,
      ProjectPermissionMemberActions.Delete,
      ProjectPermissionMemberActions.Read,
      ProjectPermissionMemberActions.GrantPrivileges,
      ProjectPermissionMemberActions.AssignRole,
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      ProjectPermissionMemberActions.AssumePrivileges
    ],
    ProjectPermissionSub.Member
  );

  can(
    [
      ProjectPermissionGroupActions.Create,
      ProjectPermissionGroupActions.Edit,
      ProjectPermissionGroupActions.Delete,
      ProjectPermissionGroupActions.Read,
      ProjectPermissionGroupActions.GrantPrivileges,
      ProjectPermissionGroupActions.AssignRole
    ],
    ProjectPermissionSub.Groups
  );

  can(
    [
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionIdentityActions.Delete,
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionIdentityActions.GrantPrivileges,
      ProjectPermissionIdentityActions.AssignRole,
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
      ProjectPermissionIdentityActions.AssumePrivileges,
      ProjectPermissionIdentityActions.GetToken,
      ProjectPermissionIdentityActions.CreateToken,
      ProjectPermissionIdentityActions.DeleteToken,
      ProjectPermissionIdentityActions.RevokeAuth,
      ProjectPermissionIdentityActions.EditAuth
    ],
    ProjectPermissionSub.Identity
  );

  [ProjectPermissionSub.Role, ProjectPermissionSub.Settings].forEach((subject) => {
    can(
      [
        ProjectPermissionActions.Read,
        ProjectPermissionActions.Edit,
        ProjectPermissionActions.Create,
        ProjectPermissionActions.Delete
      ],
      subject
    );
  });

  can([ProjectPermissionActions.Edit, ProjectPermissionActions.Delete], ProjectPermissionSub.Project);

  can([ProjectPermissionAuditLogsActions.Read, ProjectPermissionAuditLogsActions.Edit], ProjectPermissionSub.AuditLogs);

  return rules;
};

// Deliberately narrower than PAM's member set: no directory reads, or any member could enumerate every
// person, group and machine identity in the product.
const buildAgentVaultProjectMemberPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can([ProjectPermissionAgentVaultAccessBundleActions.Read], ProjectPermissionSub.AgentVaultAccessBundles);
  can(
    [
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills
    ],
    ProjectPermissionSub.AgentVaultSessions
  );
  can([ProjectPermissionAgentVaultProxyActions.Read], ProjectPermissionSub.AgentVaultProxies);
  can([ProjectPermissionAgentVaultSkillActions.Read], ProjectPermissionSub.AgentVaultSkills);
  can([ProjectPermissionAgentVaultHookActions.Read], ProjectPermissionSub.AgentVaultHooks);

  return rules;
};

export const agentVaultProjectAdminPermissions = buildAgentVaultProjectAdminPermissionRules();
export const agentVaultProjectMemberPermissions = buildAgentVaultProjectMemberPermissionRules();
