import { createMongoAbility } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { describe, expect, test } from "vitest";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { ActorGrants } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionCmekActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  Project
} from "@app/domains/platform/projects/ce/module";
import { buildProjectsForTests } from "@app/domains/platform/projects/ce/testing/build-projects";
import { NotFoundError } from "@app/lib/errors";

import { AgentVaultModule } from "../module";
import {
  AGENT_VAULT_BUNDLE_CONSUMER_ROLE,
  agentVaultProjectAdminPermissions,
  agentVaultResourceRoles
} from "./agent-vault-roles";

const setup = () => {
  const { service: accessControlDomain } = buildAccessControlForTests();
  const { service: projectsDomain, productAccessRegistry } = buildProjectsForTests({
    accessControlDomain,
    organizationsDomain: { getOrgPermission: async () => ({}) as never },
    projects: []
  });
  // Constructing it registers Agent Vault's roles, as domains.ts does.
  const agentVault = new AgentVaultModule({
    projectsDomain: projectsDomain as never,
    accessControlDomain,
    productAccessRegistry,
    licenseRegistry: { registerUsageCounter: () => undefined } as never
  });
  expect(agentVault.name).toBe("agent-vault");
  return projectsDomain;
};

const project = Project.restore({
  id: "project-id",
  orgId: "org-id",
  type: ProjectType.AgentVault,
  name: "p",
  slug: "p"
});

const abilityFor = (role: string, permissions?: unknown) =>
  createMongoAbility<ProjectPermissionSet>(
    setup().resolveRoleRules({ entries: [{ role, permissions }], project, grants: ActorGrants.empty() }) as never
  );

describe("agent vault project roles", () => {
  test("the admin set is written out, not aliased to the generic project admin", () => {
    const admin = abilityFor(ProjectMembershipRole.Admin);

    expect(
      admin.can(
        ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
        ProjectPermissionSub.AgentVaultAccessBundles
      )
    ).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultProxyActions.Revoke, ProjectPermissionSub.AgentVaultProxies)).toBe(
      true
    );
    expect(admin.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Project)).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultSkillActions.Create, ProjectPermissionSub.AgentVaultSkills)).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultSkillActions.Delete, ProjectPermissionSub.AgentVaultSkills)).toBe(true);

    expect(admin.can(ProjectPermissionCmekActions.Rotate, ProjectPermissionSub.Cmek)).toBe(false);
    expect(admin.can(ProjectPermissionSecretSyncActions.Create, ProjectPermissionSub.SecretSyncs)).toBe(false);
    expect(admin.can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens)).toBe(false);
  });

  test("a member can mint, label and revoke sessions and read a proxy fingerprint and skills, and nothing more", () => {
    const member = abilityFor(ProjectMembershipRole.Member);

    expect(member.can(ProjectPermissionAgentVaultSessionActions.Create, ProjectPermissionSub.AgentVaultSessions)).toBe(
      true
    );
    expect(member.can(ProjectPermissionAgentVaultSessionActions.Edit, ProjectPermissionSub.AgentVaultSessions)).toBe(
      true
    );
    expect(member.can(ProjectPermissionAgentVaultSessionActions.Revoke, ProjectPermissionSub.AgentVaultSessions)).toBe(
      true
    );
    expect(member.can(ProjectPermissionAgentVaultProxyActions.Read, ProjectPermissionSub.AgentVaultProxies)).toBe(true);

    expect(member.can(ProjectPermissionAgentVaultProxyActions.Create, ProjectPermissionSub.AgentVaultProxies)).toBe(
      false
    );
    expect(
      member.can(ProjectPermissionAgentVaultAccessBundleActions.Create, ProjectPermissionSub.AgentVaultAccessBundles)
    ).toBe(false);
    expect(
      member.can(
        ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
        ProjectPermissionSub.AgentVaultAccessBundles
      )
    ).toBe(false);
    expect(member.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Project)).toBe(false);
    expect(member.can(ProjectPermissionAgentVaultSkillActions.Read, ProjectPermissionSub.AgentVaultSkills)).toBe(true);
    expect(member.can(ProjectPermissionAgentVaultSkillActions.Create, ProjectPermissionSub.AgentVaultSkills)).toBe(
      false
    );
    expect(member.can(ProjectPermissionAgentVaultSkillActions.Edit, ProjectPermissionSub.AgentVaultSkills)).toBe(false);
    expect(member.can(ProjectPermissionAgentVaultSkillActions.Delete, ProjectPermissionSub.AgentVaultSkills)).toBe(
      false
    );

    expect(member.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member)).toBe(false);
    expect(member.can(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups)).toBe(false);
    expect(member.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity)).toBe(false);
  });

  test("a custom role carrying the full admin rules still resolves to the member set", () => {
    const custom = abilityFor(ProjectMembershipRole.Custom, packRules(agentVaultProjectAdminPermissions as never));

    expect(
      custom.can(ProjectPermissionAgentVaultAccessBundleActions.Read, ProjectPermissionSub.AgentVaultAccessBundles)
    ).toBe(true);
    expect(
      custom.can(ProjectPermissionAgentVaultAccessBundleActions.Delete, ProjectPermissionSub.AgentVaultAccessBundles)
    ).toBe(false);
    expect(
      custom.can(
        ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
        ProjectPermissionSub.AgentVaultAccessBundles
      )
    ).toBe(false);
    expect(custom.can(ProjectPermissionAgentVaultProxyActions.Delete, ProjectPermissionSub.AgentVaultProxies)).toBe(
      false
    );
    expect(custom.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Project)).toBe(false);
    expect(custom.can(ProjectPermissionAgentVaultSkillActions.Read, ProjectPermissionSub.AgentVaultSkills)).toBe(true);
    expect(custom.can(ProjectPermissionAgentVaultSkillActions.Edit, ProjectPermissionSub.AgentVaultSkills)).toBe(false);
  });
});

describe("access bundle resource roles", () => {
  test("a consumer carries no rules, and an unknown slug fails loudly", () => {
    expect(agentVaultResourceRoles.resolveRole(AGENT_VAULT_BUNDLE_CONSUMER_ROLE)).toEqual([]);
    expect(() => agentVaultResourceRoles.resolveRole("admin")).toThrow(NotFoundError);
  });
});
