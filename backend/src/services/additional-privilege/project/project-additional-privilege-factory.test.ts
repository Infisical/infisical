import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { AccessScope } from "@app/db/schemas";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";
import { PermissionBoundaryError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { newProjectAdditionalPrivilegesFactory } from "./project-additional-privilege-factory";

type Rule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const ACTOR_ID = "actor-user";
const TARGET_ID = "target-user";

const createFactory = (actorRules: Rule[]) => {
  const actorPermission = createMongoAbility<ProjectPermissionSet>(actorRules, { conditionsMatcher });
  const targetPermission = createMongoAbility<ProjectPermissionSet>([]);

  const permissionService = {
    getProjectPermission: vi
      .fn()
      .mockImplementation(({ actorId }: { actorId: string }) =>
        Promise.resolve(
          actorId === TARGET_ID
            ? { permission: targetPermission, memberships: [{ actorUserId: TARGET_ID }] }
            : { permission: actorPermission, memberships: [{ actorUserId: ACTOR_ID }] }
        )
      )
  };

  return newProjectAdditionalPrivilegesFactory({
    permissionService,
    additionalPrivilegeDAL: { findOne: vi.fn() },
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: "org-1", shouldUseNewPrivilegeSystem: true }) },
    membershipDAL: { findOne: vi.fn() },
    userDAL: { findById: vi.fn().mockResolvedValue({ id: TARGET_ID, email: "target@example.com" }) },
    projectDAL: {
      findById: vi
        .fn()
        .mockResolvedValue({ id: "project-1", name: "Project", isLegacyAdditionalPrivilegesEnabled: true })
    }
  } as never);
};

const createPrivilege = (factory: ReturnType<typeof createFactory>, permissions: unknown) =>
  factory.onCreateAdditionalPrivilegesGuard({
    permission: { type: ActorType.USER, id: ACTOR_ID, orgId: "org-1", authMethod: null, rootOrgId: "org-1" },
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
});
