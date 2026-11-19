import { createMongoAbility } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { agentVaultProjectAdminPermissions } from "@app/ee/services/permission/default-roles";
import { ProjectPermissionSub } from "@app/ee/services/permission/project-permission";

import { intersectIds, intersectReach, reachOf, visibleIdsWithin } from "./agent-vault-permission";
import { agentVaultMemberTestRules, agentVaultTestReachDAL } from "./testing/agent-vault-test-roles";

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
