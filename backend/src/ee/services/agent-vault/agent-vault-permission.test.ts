import { createMongoAbility } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { describe, expect, test, vi } from "vitest";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { agentVaultProjectAdminPermissions } from "@app/ee/services/permission/default-roles";
import { buildProjectPermissionRules } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionSet, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";

import {
  intersectIds,
  intersectReach,
  reachOf,
  usableServiceIdsOf,
  usableSkillIdsOf,
  visibleIdsWithin
} from "./agent-vault-permission";
import { agentVaultMemberTestRules, agentVaultTestReachDAL } from "./testing/agent-vault-test-roles";

type TRule = { subject: string; action: string[]; conditions?: Record<string, unknown>; inverted?: boolean };

// The permission of a member who holds these custom roles, built the way the permission service builds it.
const permissionOfRoles = (...roles: TRule[][]) =>
  createMongoAbility<ProjectPermissionSet>(
    buildProjectPermissionRules(
      roles.map((rules) => ({ role: ProjectMembershipRole.Custom, permissions: packRules(rules as never) })),
      ProjectType.AgentVault
    ),
    { conditionsMatcher }
  );

const useBundle = (accessBundleId?: string): TRule => ({
  subject: ProjectPermissionSub.AgentVaultAccessBundles,
  action: ["use"],
  ...(accessBundleId ? { conditions: { accessBundleId } } : {})
});

const denyUse = (subjectType: ProjectPermissionSub, conditions?: Record<string, unknown>): TRule => ({
  subject: subjectType,
  action: ["use"],
  inverted: true,
  ...(conditions ? { conditions } : {})
});

describe("intersectIds", () => {
  // null covers everything, the admin role's reach.
  test.each([
    { a: null, b: null, expected: null },
    { a: null, b: [], expected: [] },
    { a: [], b: null, expected: [] },
    { a: null, b: ["x"], expected: ["x"] },
    { a: ["x"], b: null, expected: ["x"] },
    { a: ["x", "y"], b: ["y", "z"], expected: ["y"] },
    { a: ["x"], b: ["z"], expected: [] }
  ])("$a and $b reach $expected", ({ a, b, expected }) => {
    expect(intersectIds(a, b)).toEqual(expected);
  });
});

describe("reachOf", () => {
  const reachDAL = agentVaultTestReachDAL({ accessBundleIds: ["b1", "b2"], serviceIds: ["s1"], skillIds: ["k1"] });

  test("admin reaches everything without listing anything", async () => {
    expect(
      await reachOf(createMongoAbility(agentVaultProjectAdminPermissions), { agentVaultReachDAL: reachDAL }, "p")
    ).toEqual({
      accessBundleIds: null,
      serviceIds: null,
      skillIds: null
    });
  });

  test("a role naming bundles reaches only those, and nothing directly", async () => {
    expect(
      await reachOf(createMongoAbility(agentVaultMemberTestRules(["b2"])), { agentVaultReachDAL: reachDAL }, "p")
    ).toEqual({
      accessBundleIds: ["b2"],
      serviceIds: [],
      skillIds: []
    });
  });

  test("a deny takes an id back from an unconditioned allow", async () => {
    const ability = createMongoAbility([
      { action: "use", subject: ProjectPermissionSub.AgentVaultAccessBundles },
      {
        action: "use",
        subject: ProjectPermissionSub.AgentVaultAccessBundles,
        inverted: true,
        conditions: { accessBundleId: "b1" }
      }
    ]);
    expect((await reachOf(ability as never, { agentVaultReachDAL: reachDAL }, "p")).accessBundleIds).toEqual(["b2"]);
  });

  test("a session on a user's behalf reaches what both reach, list by list", () => {
    expect(
      intersectReach(
        { accessBundleIds: null, serviceIds: ["s1", "s2"], skillIds: [] },
        { accessBundleIds: ["b1"], serviceIds: ["s2"], skillIds: null }
      )
    ).toEqual({ accessBundleIds: ["b1"], serviceIds: ["s2"], skillIds: [] });
  });
});

describe("visibleIdsWithin", () => {
  test("read or use on an id lets the actor see it", async () => {
    const ability = createMongoAbility([
      { action: "read", subject: ProjectPermissionSub.AgentVaultServices, conditions: { serviceId: "s1" } },
      { action: "use", subject: ProjectPermissionSub.AgentVaultServices, conditions: { serviceId: "s2" } }
    ]);
    expect(
      await visibleIdsWithin(ability as never, {
        subjectType: ProjectPermissionSub.AgentVaultServices,
        field: "serviceId",
        loadIds: async () => ["s1", "s2", "s3"]
      })
    ).toEqual(["s1", "s2"]);
  });
});

describe("a deny in one role holds against another", () => {
  const reachDAL = agentVaultTestReachDAL({
    accessBundleIds: ["b1", "b2"],
    serviceIds: ["s1", "s2"],
    skillIds: ["k1"]
  });

  test("a deny in a second role takes a bundle back from the first", async () => {
    const permission = permissionOfRoles(
      [useBundle()],
      [denyUse(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: "b1" })]
    );
    expect((await reachOf(permission, { agentVaultReachDAL: reachDAL }, "p")).accessBundleIds).toEqual(["b2"]);
  });

  test("a bundle doesn't give a service another role denies", async () => {
    const permission = permissionOfRoles(
      [useBundle("b1")],
      [denyUse(ProjectPermissionSub.AgentVaultServices, { serviceId: "s1" })]
    );
    const reach = await reachOf(permission, { agentVaultReachDAL: reachDAL }, "p");
    expect(reach.deniedServiceIds).toEqual(["s1"]);

    const usable = await usableServiceIdsOf(
      {
        agentVaultServiceDAL: { findIdsInBundles: async () => ["s1", "s2"] },
        agentVaultReachDAL: reachDAL
      },
      reach,
      "p"
    );
    expect(usable).toEqual(["s2"]);
  });

  test("a deny on every skill leaves none in any bundle", async () => {
    const permission = permissionOfRoles([useBundle("b1")], [denyUse(ProjectPermissionSub.AgentVaultSkills)]);
    const reach = await reachOf(permission, { agentVaultReachDAL: reachDAL }, "p");
    expect(reach.deniedSkillIds).toBe("all");

    const usable = await usableSkillIdsOf(
      {
        agentVaultSkillBundleDAL: { findSkillIdsInBundles: async () => ["k1"] },
        agentVaultReachDAL: reachDAL
      },
      reach,
      "p"
    );
    expect(usable).toEqual([]);
  });

  test("a deny that a later allow overrides takes nothing back", async () => {
    const ability = createMongoAbility([
      { action: "use", subject: ProjectPermissionSub.AgentVaultAccessBundles },
      {
        action: "use",
        subject: ProjectPermissionSub.AgentVaultServices,
        inverted: true,
        conditions: { serviceId: "s1" }
      },
      { action: "use", subject: ProjectPermissionSub.AgentVaultServices, conditions: { serviceId: "s1" } }
    ]);
    const reach = await reachOf(ability as never, { agentVaultReachDAL: reachDAL }, "p");
    expect(reach.serviceIds).toEqual(["s1"]);
    expect(reach.deniedServiceIds).toBeUndefined();
  });

  test("a session on a user's behalf keeps either side's deny", () => {
    const base = { accessBundleIds: null, serviceIds: [], skillIds: [] };
    expect(
      intersectReach({ ...base, deniedServiceIds: ["s1"] }, { ...base, deniedServiceIds: ["s2"] }).deniedServiceIds
    ).toEqual(["s1", "s2"]);
    expect(intersectReach({ ...base, deniedSkillIds: "all" }, { ...base, deniedSkillIds: ["k1"] }).deniedSkillIds).toBe(
      "all"
    );
  });
});

describe("reachOf looks up only what it needs", () => {
  const spyDAL = () => ({
    findAccessBundleIds: vi.fn(
      async (_projectId: string, _tx?: unknown, onlyIds?: string[]) => onlyIds ?? ["b1", "b2"]
    ),
    findServiceIds: vi.fn(async () => ["s1"]),
    findSkillIds: vi.fn(async () => ["k1"])
  });

  test("a role that names its bundles looks up only those", async () => {
    const reachDAL = spyDAL();
    const permission = permissionOfRoles([useBundle("b1")]);
    expect((await reachOf(permission, { agentVaultReachDAL: reachDAL }, "p")).accessBundleIds).toEqual(["b1"]);
    expect(reachDAL.findAccessBundleIds).toHaveBeenCalledWith("p", undefined, ["b1"]);
  });

  test("an allow on every bundle with a deny still looks up the whole list", async () => {
    const reachDAL = spyDAL();
    const permission = permissionOfRoles([
      useBundle(),
      denyUse(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: "b1" })
    ]);
    expect((await reachOf(permission, { agentVaultReachDAL: reachDAL }, "p")).accessBundleIds).toEqual(["b2"]);
    expect(reachDAL.findAccessBundleIds).toHaveBeenCalledWith("p", undefined, undefined);
  });

  test("a kind left out is never looked up and reaches nothing", async () => {
    const reachDAL = spyDAL();
    const permission = permissionOfRoles([
      { subject: ProjectPermissionSub.AgentVaultSkills, action: ["use"], conditions: { skillId: "k1" } }
    ]);
    const reach = await reachOf(permission, { agentVaultReachDAL: reachDAL }, "p", undefined, { skills: false });
    expect(reach.skillIds).toEqual([]);
    expect(reachDAL.findSkillIds).not.toHaveBeenCalled();
  });
});
