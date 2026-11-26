import { createMongoAbility, subject } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { describe, expect, test } from "vitest";

import { ProjectMembershipRole, ProjectType, ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import { AgentVaultResourceRole } from "@app/ee/services/agent-vault/agent-vault-enums";
import { PamResourceRole } from "@app/ee/services/pam/pam-enums";
import { NotFoundError } from "@app/lib/errors";

import {
  agentVaultProjectAdminPermissions,
  applicationAuditorPermissions,
  pamResourceAdminPermissions,
  signerOperatorPermissions
} from "./default-roles";
import { buildProjectPermissionRules, resolveResourceRoleRules } from "./permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultServiceActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionCmekActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
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

const OTHER_ACTOR_ID = "6f1c3a9e-2d4b-4c7a-8e1f-9b3d5a7c0e24";

// Each of these replaced a check on the admin role, so the admin set has to hold every one and no other role any.
const replacedRoleChecks = (ability: ReturnType<typeof abilityFor>) =>
  Object.fromEntries([
    ...[
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionAgentVaultSessionActions.Revoke
    ].map((action) => [
      `sessions ${action} another actor's`,
      ability.can(action, subject(ProjectPermissionSub.AgentVaultSessions, { actorId: OTHER_ACTOR_ID }))
    ]),
    [
      "sessions create-with-inline-services",
      ability.can(
        ProjectPermissionAgentVaultSessionActions.CreateWithInlineServices,
        ProjectPermissionSub.AgentVaultSessions
      )
    ],
    ...Object.values(ProjectPermissionAgentVaultVariableActions).map((action) => [
      `variables ${action}`,
      ability.can(action, ProjectPermissionSub.AgentVaultVariables)
    ]),
    ...[
      ProjectPermissionAgentVaultHookActions.Create,
      ProjectPermissionAgentVaultHookActions.Edit,
      ProjectPermissionAgentVaultHookActions.Delete
    ].map((action) => [`hooks ${action}`, ability.can(action, ProjectPermissionSub.AgentVaultHooks)]),
    ["settings read", ability.can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings)],
    ["settings edit", ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings)],
    ["proxies edit", ability.can(ProjectPermissionAgentVaultProxyActions.Edit, ProjectPermissionSub.AgentVaultProxies)],
    [
      "bundles edit",
      ability.can(ProjectPermissionAgentVaultAccessBundleActions.Edit, ProjectPermissionSub.AgentVaultAccessBundles)
    ],
    [
      "services edit",
      ability.can(ProjectPermissionAgentVaultServiceActions.Edit, ProjectPermissionSub.AgentVaultServices)
    ],
    ...[
      ProjectPermissionMemberActions.Create,
      ProjectPermissionMemberActions.Edit,
      ProjectPermissionMemberActions.Delete
    ].map((action) => [`users ${action}`, ability.can(action, ProjectPermissionSub.Member)]),
    ...[
      ProjectPermissionGroupActions.Create,
      ProjectPermissionGroupActions.Edit,
      ProjectPermissionGroupActions.Delete
    ].map((action) => [`groups ${action}`, ability.can(action, ProjectPermissionSub.Groups)]),
    ...[
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionIdentityActions.Delete
    ].map((action) => [`identities ${action}`, ability.can(action, ProjectPermissionSub.Identity)])
  ]) as Record<string, boolean>;

describe("agent vault project roles", () => {
  test("only the admin set holds the actions that replaced role checks, and No Access and Member hold nothing", () => {
    const allowed = (checks: Record<string, boolean>) => Object.keys(checks).filter((key) => checks[key]);
    const adminChecks = replacedRoleChecks(abilityFor(ProjectMembershipRole.Admin));

    expect(allowed(adminChecks)).toEqual(Object.keys(adminChecks));
    expect(allowed(replacedRoleChecks(abilityFor(ProjectMembershipRole.NoAccess)))).toEqual([]);
    // A Member row the role migration has not converted yet.
    expect(abilityFor(ProjectMembershipRole.Member).rules).toEqual([]);
  });

  test("the admin set is written out, not aliased to the generic project admin", () => {
    const admin = abilityFor(ProjectMembershipRole.Admin);

    expect(
      admin.can(ProjectPermissionAgentVaultAccessBundleActions.Use, ProjectPermissionSub.AgentVaultAccessBundles)
    ).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultServiceActions.Use, ProjectPermissionSub.AgentVaultServices)).toBe(
      true
    );
    expect(admin.can(ProjectPermissionAgentVaultServiceActions.Edit, ProjectPermissionSub.AgentVaultServices)).toBe(
      true
    );
    expect(admin.can(ProjectPermissionAgentVaultSkillActions.Use, ProjectPermissionSub.AgentVaultSkills)).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultProxyActions.Revoke, ProjectPermissionSub.AgentVaultProxies)).toBe(
      true
    );
    expect(admin.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Project)).toBe(true);
    expect(
      admin.can(
        ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills,
        ProjectPermissionSub.AgentVaultSessions
      )
    ).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultSkillActions.Create, ProjectPermissionSub.AgentVaultSkills)).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultSkillActions.Delete, ProjectPermissionSub.AgentVaultSkills)).toBe(true);
    expect(admin.can(ProjectPermissionAgentVaultHookActions.Edit, ProjectPermissionSub.AgentVaultHooks)).toBe(true);

    expect(admin.can(ProjectPermissionCmekActions.Rotate, ProjectPermissionSub.Cmek)).toBe(false);
    expect(admin.can(ProjectPermissionSecretSyncActions.Create, ProjectPermissionSub.SecretSyncs)).toBe(false);
    expect(admin.can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens)).toBe(false);
  });

  test("a custom role is exactly its own rules: the full admin set grants what admin does", () => {
    const custom = abilityFor(ProjectMembershipRole.Custom, packRules(agentVaultProjectAdminPermissions as never));
    const allowed = (checks: Record<string, boolean>) => Object.keys(checks).filter((key) => checks[key]);
    const checks = replacedRoleChecks(custom);

    expect(allowed(checks)).toEqual(Object.keys(checks));
  });

  test("a custom role naming one bundle can use that bundle and no other, and nothing else", () => {
    const custom = abilityFor(
      ProjectMembershipRole.Custom,
      packRules([
        {
          action: [ProjectPermissionAgentVaultAccessBundleActions.Use],
          subject: ProjectPermissionSub.AgentVaultAccessBundles,
          conditions: { accessBundleId: "bundle-1" }
        }
      ] as never)
    );

    expect(
      custom.can(
        ProjectPermissionAgentVaultAccessBundleActions.Use,
        subject(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: "bundle-1" })
      )
    ).toBe(true);
    expect(
      custom.can(
        ProjectPermissionAgentVaultAccessBundleActions.Use,
        subject(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: "bundle-2" })
      )
    ).toBe(false);
    expect(custom.can(ProjectPermissionAgentVaultSessionActions.Create, ProjectPermissionSub.AgentVaultSessions)).toBe(
      false
    );
    expect(custom.can(ProjectPermissionAgentVaultServiceActions.Use, ProjectPermissionSub.AgentVaultServices)).toBe(
      false
    );
  });
});

describe("resource role dispatch", () => {
  test("an agent vault consumer carries no rules, and an unknown slug fails loudly", () => {
    expect(resolveResourceRoleRules(ResourceType.AgentVaultAccessBundle, AgentVaultResourceRole.Consumer)).toEqual([]);
    expect(() => resolveResourceRoleRules(ResourceType.AgentVaultAccessBundle, "admin")).toThrow(NotFoundError);
  });

  test("the other products' arms are untouched", () => {
    expect(resolveResourceRoleRules(ResourceType.PamFolder, PamResourceRole.Admin)).toBe(pamResourceAdminPermissions);
    expect(resolveResourceRoleRules(ResourceType.Signer, ResourceMembershipRole.Operator)).toBe(
      signerOperatorPermissions
    );
    expect(resolveResourceRoleRules(ResourceType.CertificateApplication, ResourceMembershipRole.Auditor)).toBe(
      applicationAuditorPermissions
    );
  });
});
