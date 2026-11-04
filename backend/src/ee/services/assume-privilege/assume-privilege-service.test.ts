import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";
import { crypto } from "@app/lib/crypto/cryptography";
import { ActorType } from "@app/services/auth/auth-type";

import {
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "../permission/project-permission";
import { assumePrivilegeServiceFactory } from "./assume-privilege-service";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ AUTH_SECRET: "test-secret" }) }));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

type Rule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const USERS: Record<string, string> = { "junior-user": "junior@example.com", "admin-user": "admin@example.com" };

const createService = (requesterRules: Rule[]) => {
  const permission = createMongoAbility<ProjectPermissionSet>(requesterRules, { conditionsMatcher });
  return assumePrivilegeServiceFactory({
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ permission }) },
    userDAL: { findById: vi.fn().mockImplementation((id: string) => Promise.resolve({ id, email: USERS[id] })) }
  } as never);
};

const assume = (service: ReturnType<typeof createService>, targetActorId: string) =>
  service.assumeProjectPrivileges({
    targetActorType: ActorType.USER,
    targetActorId,
    projectId: "project-1",
    tokenVersionId: "token-version",
    actorPermissionDetails: { type: ActorType.USER, id: "requester", orgId: "org-1", authMethod: null } as never
  });

describe("assume member privileges", () => {
  beforeAll(async () => {
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize({} as never, {} as never, {} as never);
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
      service.verifyAssumePrivilegeToken(assumePrivilegesToken, "token-version", null, "org-1")
    ).resolves.toMatchObject({ actorId: "junior-user" });
  });

  test("the target's email is not looked up when the target is not in the project", async () => {
    const permission = createMongoAbility<ProjectPermissionSet>(
      [{ action: ProjectPermissionMemberActions.AssumePrivileges, subject: ProjectPermissionSub.Member }],
      { conditionsMatcher }
    );
    const findById = vi.fn();
    const service = assumePrivilegeServiceFactory({
      permissionService: {
        getProjectPermission: vi
          .fn()
          .mockImplementation(({ actorId }: { actorId: string }) =>
            actorId === "requester" ? Promise.resolve({ permission }) : Promise.reject(new Error("not a member"))
          )
      },
      userDAL: { findById }
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
      restricted.verifyAssumePrivilegeToken(assumePrivilegesToken, "token-version", null, "org-1")
    ).rejects.toThrow(ForbiddenError);
  });
});
