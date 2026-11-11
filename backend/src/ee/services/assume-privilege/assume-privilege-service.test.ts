import { ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { TActorContext } from "@app/domains/lib/actor-context";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { crypto } from "@app/lib/crypto/cryptography";

import { assumePrivilegeServiceFactory } from "./assume-privilege-service";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ AUTH_SECRET: "test-secret" }) }));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

type Rule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const actorContexts = {
  forPrincipal: vi.fn().mockImplementation(async (principal: unknown) => ({ principal, org: { id: "org-1" } }))
};

const USERS: Record<string, string> = { "junior-user": "junior@example.com", "admin-user": "admin@example.com" };

const createService = (requesterRules: Rule[]) => {
  const permission = Permission.fromRules<ProjectPermissionSet>({ rules: requesterRules });
  return assumePrivilegeServiceFactory({
    projectsDomain: { getProjectPermission: vi.fn().mockResolvedValue(permission) },
    actorContexts,
    userDAL: { findById: vi.fn().mockImplementation((id: string) => Promise.resolve({ id, email: USERS[id] })) },
    identityDAL: { findById: vi.fn() }
  } as never);
};

const assume = (service: ReturnType<typeof createService>, targetActorId: string) =>
  service.assumeProjectPrivileges({
    targetActorType: ActorType.USER,
    targetActorId,
    projectId: "project-1",
    tokenVersionId: "token-version",
    actor: { principal: { type: ActorType.USER, id: "requester" }, org: { id: "org-1" } } as TActorContext
  });

describe("assume member privileges", () => {
  beforeAll(async () => {
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize(async () => null);
  });

  afterAll(() => {
    delete process.env.FIPS_ENABLED;
  });

  test("an unconditional rule allows assuming any member", async () => {
    const service = createService([
      { action: ProjectPermissionMemberActions.AssumePrivileges, subject: ProjectPermissionSub.Member }
    ]);

    await expect(assume(service, "admin-user")).resolves.toMatchObject({ actorId: "admin-user" });
  });

  test("a forbid on a member's email is enforced", async () => {
    const service = createService([
      { action: ProjectPermissionMemberActions.AssumePrivileges, subject: ProjectPermissionSub.Member },
      {
        inverted: true,
        action: ProjectPermissionMemberActions.AssumePrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: { userEmail: "admin@example.com" }
      }
    ]);

    await expect(assume(service, "admin-user")).rejects.toThrow(ForbiddenError);
    await expect(assume(service, "junior-user")).resolves.toMatchObject({ actorId: "junior-user" });
  });

  test("an allow on a member's email only allows assuming that member", async () => {
    const service = createService([
      {
        action: ProjectPermissionMemberActions.AssumePrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: { userEmail: { $eq: "junior@example.com" } }
      }
    ]);

    const { assumePrivilegesToken } = await assume(service, "junior-user");
    await expect(assume(service, "admin-user")).rejects.toThrow(ForbiddenError);
    await expect(
      service.verifyAssumePrivilegeToken(assumePrivilegesToken, "token-version", "org-1")
    ).resolves.toMatchObject({ actorId: "junior-user" });
  });

  test("the target's email is not looked up when the target is not in the project", async () => {
    const permission = Permission.fromRules<ProjectPermissionSet>({
      rules: [{ action: ProjectPermissionMemberActions.AssumePrivileges, subject: ProjectPermissionSub.Member }]
    });
    const findById = vi.fn();
    const service = assumePrivilegeServiceFactory({
      projectsDomain: {
        getProjectPermission: vi
          .fn()
          .mockImplementation(({ actor }: { actor: TActorContext }) =>
            actor.principal.id === "requester" ? Promise.resolve(permission) : Promise.reject(new Error("not a member"))
          )
      },
      actorContexts,
      userDAL: { findById },
      identityDAL: { findById: vi.fn() }
    } as never);

    await expect(assume(service, "outsider")).rejects.toThrow("not a member");
    expect(findById).not.toHaveBeenCalled();
  });

  test("the forbid is also enforced when the session token is verified", async () => {
    const allowAll: Rule = {
      action: ProjectPermissionMemberActions.AssumePrivileges,
      subject: ProjectPermissionSub.Member
    };
    const { assumePrivilegesToken } = await assume(createService([allowAll]), "admin-user");

    const restricted = createService([
      allowAll,
      {
        inverted: true,
        action: ProjectPermissionMemberActions.AssumePrivileges,
        subject: ProjectPermissionSub.Member,
        conditions: { userEmail: "admin@example.com" }
      }
    ]);

    await expect(
      restricted.verifyAssumePrivilegeToken(assumePrivilegesToken, "token-version", "org-1")
    ).rejects.toThrow(ForbiddenError);
  });
});
