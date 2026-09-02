import { createMongoAbility } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { describe, expect, test } from "vitest";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";

import { agentVaultProjectAdminPermissions } from "./default-roles";
import { buildProjectPermissionRules } from "./permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionCmekActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

const abilityFor = (role: string, permissions?: unknown) =>
  createMongoAbility<ProjectPermissionSet>(
    buildProjectPermissionRules(
      [{ role, permissions }] as Parameters<typeof buildProjectPermissionRules>[0],
      ProjectType.AgentVault
    ) as never
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

    // Aliasing to projectAdminPermissions would silently hand an Agent Vault admin every
    // secret-manager ability. These three are the canaries.
    expect(admin.can(ProjectPermissionCmekActions.Rotate, ProjectPermissionSub.Cmek)).toBe(false);
    expect(admin.can(ProjectPermissionSecretSyncActions.Create, ProjectPermissionSub.SecretSyncs)).toBe(false);
    expect(admin.can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens)).toBe(false);
  });

  test("a member can mint and revoke sessions and read a proxy fingerprint, and nothing more", () => {
    const member = abilityFor(ProjectMembershipRole.Member);

    expect(member.can(ProjectPermissionAgentVaultSessionActions.Create, ProjectPermissionSub.AgentVaultSessions)).toBe(
      true
    );
    expect(member.can(ProjectPermissionAgentVaultSessionActions.Revoke, ProjectPermissionSub.AgentVaultSessions)).toBe(
      true
    );
    // The Proxies page is the only place a fingerprint to pin comes from, so read is on the member role.
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
  });

  test("a custom role carrying the full admin rules still resolves to the member set", () => {
    // Custom is how a custom role and additional privileges both arrive. Anything that is not the admin
    // slug resolves to member, so neither can reintroduce project-level power.
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
  });
});
