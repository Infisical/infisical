import { packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant, Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionCmekActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";

import { AgentVaultProjectRoles } from "./agent-vault-project-roles";
import { agentVaultProjectAdminPermissions } from "./agent-vault-roles";

const permissionFor = (slug: string, packedRules?: unknown) =>
  Permission.fromRules<ProjectPermissionSet>({
    rules: new AgentVaultProjectRoles().rulesFor(Grant.restore({ slug, packedRules }))
  });

type TAgentVaultPermission = ReturnType<typeof permissionFor>;

const can = (permission: TAgentVaultPermission, action: string, subject: ProjectPermissionSub) =>
  permission.can({ action, subject } as Parameters<TAgentVaultPermission["can"]>[0]);

// Each of these replaced a check on the admin role, so the admin set has to hold every one and no other role any.
const replacedRoleChecks = (permission: TAgentVaultPermission) =>
  Object.fromEntries([
    ...[
      ProjectPermissionAgentVaultSessionActions.ReadAny,
      ProjectPermissionAgentVaultSessionActions.EditAny,
      ProjectPermissionAgentVaultSessionActions.RevokeAny,
      ProjectPermissionAgentVaultSessionActions.CreateWithInlineServices
    ].map((action) => [`sessions ${action}`, can(permission, action, ProjectPermissionSub.AgentVaultSessions)]),
    ...Object.values(ProjectPermissionAgentVaultVariableActions).map((action) => [
      `variables ${action}`,
      can(permission, action, ProjectPermissionSub.AgentVaultVariables)
    ]),
    ...[
      ProjectPermissionAgentVaultHookActions.Create,
      ProjectPermissionAgentVaultHookActions.Edit,
      ProjectPermissionAgentVaultHookActions.Delete
    ].map((action) => [`hooks ${action}`, can(permission, action, ProjectPermissionSub.AgentVaultHooks)]),
    ["settings read", can(permission, ProjectPermissionActions.Read, ProjectPermissionSub.Settings)],
    ["settings edit", can(permission, ProjectPermissionActions.Edit, ProjectPermissionSub.Settings)],
    [
      "proxies edit",
      can(permission, ProjectPermissionAgentVaultProxyActions.Edit, ProjectPermissionSub.AgentVaultProxies)
    ],
    [
      "bundles manage-members",
      can(
        permission,
        ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
        ProjectPermissionSub.AgentVaultAccessBundles
      )
    ],
    ...[
      ProjectPermissionMemberActions.Create,
      ProjectPermissionMemberActions.Edit,
      ProjectPermissionMemberActions.Delete
    ].map((action) => [`users ${action}`, can(permission, action, ProjectPermissionSub.Member)]),
    ...[
      ProjectPermissionGroupActions.Create,
      ProjectPermissionGroupActions.Edit,
      ProjectPermissionGroupActions.Delete
    ].map((action) => [`groups ${action}`, can(permission, action, ProjectPermissionSub.Groups)]),
    ...[
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionIdentityActions.Delete
    ].map((action) => [`identities ${action}`, can(permission, action, ProjectPermissionSub.Identity)])
  ]) as Record<string, boolean>;

const allowed = (checks: Record<string, boolean>) => Object.keys(checks).filter((key) => checks[key]);

describe("AgentVaultProjectRoles.rulesFor", () => {
  test("should let the admin and a member send skills inline with a session", () => {
    // Setup
    const check = {
      action: ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills,
      subject: ProjectPermissionSub.AgentVaultSessions
    };

    // Action
    const granted = [ProjectMembershipRole.Admin, ProjectMembershipRole.Member].map((slug) =>
      permissionFor(slug).can(check)
    );

    // Assert
    expect(granted).toEqual([true, true]);
  });

  test("should let the admin, and not a member, edit the project's audit log settings", () => {
    // Setup
    const check = { action: ProjectPermissionAuditLogsActions.Edit, subject: ProjectPermissionSub.AuditLogs };

    // Action
    const granted = [ProjectMembershipRole.Admin, ProjectMembershipRole.Member].map((slug) =>
      permissionFor(slug).can(check)
    );

    // Assert
    expect(granted).toEqual([true, false]);
  });

  test("should give only the admin set the actions that replaced role checks", () => {
    // Setup
    const adminChecks = replacedRoleChecks(permissionFor(ProjectMembershipRole.Admin));
    const memberChecks = replacedRoleChecks(permissionFor(ProjectMembershipRole.Member));
    const customChecks = replacedRoleChecks(
      permissionFor(ProjectMembershipRole.Custom, packRules(agentVaultProjectAdminPermissions))
    );

    // Action
    const granted = [allowed(adminChecks), allowed(memberChecks), allowed(customChecks)];

    // Assert
    expect(granted).toEqual([Object.keys(adminChecks), [], []]);
    expect(new AgentVaultProjectRoles().projectType).toBe(ProjectType.AgentVault);
  });

  test("should write the admin set out rather than alias the generic project admin", () => {
    // Setup
    const admin = permissionFor(ProjectMembershipRole.Admin);

    // Action
    const results = {
      manageBundleMembers: can(
        admin,
        ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
        ProjectPermissionSub.AgentVaultAccessBundles
      ),
      revokeProxy: can(admin, ProjectPermissionAgentVaultProxyActions.Revoke, ProjectPermissionSub.AgentVaultProxies),
      editProject: can(admin, ProjectPermissionActions.Edit, ProjectPermissionSub.Project),
      createSkill: can(admin, ProjectPermissionAgentVaultSkillActions.Create, ProjectPermissionSub.AgentVaultSkills),
      deleteSkill: can(admin, ProjectPermissionAgentVaultSkillActions.Delete, ProjectPermissionSub.AgentVaultSkills),
      rotateCmek: can(admin, ProjectPermissionCmekActions.Rotate, ProjectPermissionSub.Cmek),
      createSecretSync: can(admin, ProjectPermissionSecretSyncActions.Create, ProjectPermissionSub.SecretSyncs),
      createServiceToken: can(admin, ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens)
    };

    // Assert
    expect(results).toEqual({
      manageBundleMembers: true,
      revokeProxy: true,
      editProject: true,
      createSkill: true,
      deleteSkill: true,
      rotateCmek: false,
      createSecretSync: false,
      createServiceToken: false
    });
  });

  test("should let a member mint, label and revoke sessions and read proxies and skills, and nothing more", () => {
    // Setup
    const member = permissionFor(ProjectMembershipRole.Member);

    // Action
    const results = {
      createSession: can(
        member,
        ProjectPermissionAgentVaultSessionActions.Create,
        ProjectPermissionSub.AgentVaultSessions
      ),
      editSession: can(member, ProjectPermissionAgentVaultSessionActions.Edit, ProjectPermissionSub.AgentVaultSessions),
      revokeSession: can(
        member,
        ProjectPermissionAgentVaultSessionActions.Revoke,
        ProjectPermissionSub.AgentVaultSessions
      ),
      readProxy: can(member, ProjectPermissionAgentVaultProxyActions.Read, ProjectPermissionSub.AgentVaultProxies),
      readSkill: can(member, ProjectPermissionAgentVaultSkillActions.Read, ProjectPermissionSub.AgentVaultSkills),
      readHook: can(member, ProjectPermissionAgentVaultHookActions.Read, ProjectPermissionSub.AgentVaultHooks),
      createProxy: can(member, ProjectPermissionAgentVaultProxyActions.Create, ProjectPermissionSub.AgentVaultProxies),
      createBundle: can(
        member,
        ProjectPermissionAgentVaultAccessBundleActions.Create,
        ProjectPermissionSub.AgentVaultAccessBundles
      ),
      manageBundleMembers: can(
        member,
        ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
        ProjectPermissionSub.AgentVaultAccessBundles
      ),
      editProject: can(member, ProjectPermissionActions.Edit, ProjectPermissionSub.Project),
      createSkill: can(member, ProjectPermissionAgentVaultSkillActions.Create, ProjectPermissionSub.AgentVaultSkills),
      editSkill: can(member, ProjectPermissionAgentVaultSkillActions.Edit, ProjectPermissionSub.AgentVaultSkills),
      deleteSkill: can(member, ProjectPermissionAgentVaultSkillActions.Delete, ProjectPermissionSub.AgentVaultSkills),
      readMembers: can(member, ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member),
      readGroups: can(member, ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups),
      readIdentities: can(member, ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity)
    };

    // Assert
    expect(results).toEqual({
      createSession: true,
      editSession: true,
      revokeSession: true,
      readProxy: true,
      readSkill: true,
      readHook: true,
      createProxy: false,
      createBundle: false,
      manageBundleMembers: false,
      editProject: false,
      createSkill: false,
      editSkill: false,
      deleteSkill: false,
      readMembers: false,
      readGroups: false,
      readIdentities: false
    });
  });

  test("should read a custom role carrying the full admin rules as the member set", () => {
    // Setup
    const custom = permissionFor(ProjectMembershipRole.Custom, packRules(agentVaultProjectAdminPermissions));

    // Action
    const results = {
      readBundle: can(
        custom,
        ProjectPermissionAgentVaultAccessBundleActions.Read,
        ProjectPermissionSub.AgentVaultAccessBundles
      ),
      deleteBundle: can(
        custom,
        ProjectPermissionAgentVaultAccessBundleActions.Delete,
        ProjectPermissionSub.AgentVaultAccessBundles
      ),
      deleteProxy: can(custom, ProjectPermissionAgentVaultProxyActions.Delete, ProjectPermissionSub.AgentVaultProxies),
      editProject: can(custom, ProjectPermissionActions.Edit, ProjectPermissionSub.Project),
      readSkill: can(custom, ProjectPermissionAgentVaultSkillActions.Read, ProjectPermissionSub.AgentVaultSkills),
      editSkill: can(custom, ProjectPermissionAgentVaultSkillActions.Edit, ProjectPermissionSub.AgentVaultSkills)
    };

    // Assert
    expect(results).toEqual({
      readBundle: true,
      deleteBundle: false,
      deleteProxy: false,
      editProject: false,
      readSkill: true,
      editSkill: false
    });
  });
});
