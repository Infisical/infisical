import { MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { AccessScope } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { PermissionBoundaryError } from "@app/lib/errors";

import { newProjectAdditionalPrivilegesFactory } from "./project-additional-privilege-factory";

type Rule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const ACTOR_ID = "actor-user";
const TARGET_ID = "target-user";

const createFactory = (actorRules: Rule[]) => {
  const withMembership = (permission: Permission<ProjectPermissionSet>, actorUserId: string) =>
    Object.assign(permission, { memberships: [{ toJSON: () => ({ actorUserId }) }] });
  const actorPermission = withMembership(Permission.fromRules({ rules: actorRules }), ACTOR_ID);
  const targetPermission = withMembership(Permission.none<ProjectPermissionSet>(), TARGET_ID);

  const projectsDomain = {
    getProjectPermission: vi
      .fn()
      .mockImplementation(({ actor }: { actor: TActorContext }) =>
        Promise.resolve(actor.principal.id === TARGET_ID ? targetPermission : actorPermission)
      )
  };

  return newProjectAdditionalPrivilegesFactory({
    projectsDomain,
    actorContexts: {
      forPrincipal: vi.fn().mockImplementation(async (principal: unknown) => ({ principal, org: { id: "org-1" } }))
    },
    additionalPrivilegeDAL: { findOne: vi.fn() },
    membershipDAL: { findOne: vi.fn() },
    userDAL: { findById: vi.fn().mockResolvedValue({ id: TARGET_ID, email: "target@example.com" }) },
    identityDAL: { findById: vi.fn() },
    projectDAL: {
      findById: vi
        .fn()
        .mockResolvedValue({ id: "project-1", name: "Project", isLegacyAdditionalPrivilegesEnabled: true })
    }
  } as never);
};

const createPrivilege = (factory: ReturnType<typeof createFactory>, permissions: unknown) =>
  factory.onCreateAdditionalPrivilegesGuard({
    actor: {
      principal: { type: ActorType.USER, id: ACTOR_ID, authMethod: null },
      org: { id: "org-1", rootOrgId: "org-1", shouldUseNewPrivilegeSystem: true }
    },
    scopeData: { scope: AccessScope.Project, orgId: "org-1", projectId: "project-1" },
    data: { actorId: TARGET_ID, actorType: ActorType.USER, name: "extra", permissions, isTemporary: false }
  } as never);

const grantAnything: Rule = {
  action: [ProjectPermissionMemberActions.Edit, ProjectPermissionMemberActions.AssignAdditionalPrivileges],
  subject: ProjectPermissionSub.Member
};

const readSecrets = [{ subject: ProjectPermissionSub.Secrets, action: [ProjectPermissionSecretActions.ReadValue] }];
const readEnvironments = [{ subject: ProjectPermissionSub.Environments, action: ["read"] }];

describe("project additional privilege grant validation", () => {
  test("an unconditional grant allows granting any subject", async () => {
    await expect(createPrivilege(createFactory([grantAnything]), readSecrets)).resolves.toBeUndefined();
  });

  test("a forbid scoped by assignableSubject blocks granting that subject", async () => {
    const factory = createFactory([
      grantAnything,
      {
        inverted: true,
        action: ProjectPermissionMemberActions.AssignAdditionalPrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: { assignableSubject: ProjectPermissionSub.Secrets }
      }
    ]);

    await expect(createPrivilege(factory, readSecrets)).rejects.toThrow(PermissionBoundaryError);
    await expect(createPrivilege(factory, readEnvironments)).resolves.toBeUndefined();
  });

  test("a forbid scoped by assignableAction blocks granting that action", async () => {
    const factory = createFactory([
      grantAnything,
      {
        inverted: true,
        action: ProjectPermissionMemberActions.AssignAdditionalPrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: {
          assignableAction: `${ProjectPermissionSub.Secrets}:${ProjectPermissionSecretActions.ReadValue}`
        }
      }
    ]);

    await expect(createPrivilege(factory, readSecrets)).rejects.toThrow(PermissionBoundaryError);
    await expect(
      createPrivilege(factory, [
        { subject: ProjectPermissionSub.Secrets, action: [ProjectPermissionSecretActions.DescribeSecret] }
      ])
    ).resolves.toBeUndefined();
  });

  test("an allow on the legacy grant-privileges action does not override a forbid on the new action", async () => {
    const factory = createFactory([
      grantAnything,
      { action: ProjectPermissionMemberActions.GrantPrivileges, subject: ProjectPermissionSub.Member },
      {
        inverted: true,
        action: ProjectPermissionMemberActions.AssignAdditionalPrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: { assignableSubject: ProjectPermissionSub.Secrets }
      }
    ]);

    await expect(createPrivilege(factory, readSecrets)).rejects.toThrow(PermissionBoundaryError);
    await expect(createPrivilege(factory, readEnvironments)).resolves.toBeUndefined();
  });

  test("an allow on the legacy grant-privileges action does not override a forbid on the target's email", async () => {
    const factory = createFactory([
      grantAnything,
      { action: ProjectPermissionMemberActions.GrantPrivileges, subject: ProjectPermissionSub.Member },
      {
        inverted: true,
        action: ProjectPermissionMemberActions.AssignAdditionalPrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: { userEmail: "target@example.com" }
      }
    ]);

    await expect(createPrivilege(factory, readEnvironments)).rejects.toThrow(PermissionBoundaryError);
  });

  test("a forbid on the legacy action is enforced when the new action is allowed", async () => {
    const factory = createFactory([
      grantAnything,
      {
        inverted: true,
        action: ProjectPermissionMemberActions.GrantPrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: { assignableSubject: ProjectPermissionSub.Secrets }
      }
    ]);

    await expect(createPrivilege(factory, readSecrets)).rejects.toThrow(PermissionBoundaryError);
    await expect(createPrivilege(factory, readEnvironments)).resolves.toBeUndefined();
  });
});
