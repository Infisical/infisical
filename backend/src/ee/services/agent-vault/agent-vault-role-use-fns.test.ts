import { packRules } from "@casl/ability/extra";
import { describe, expect, test } from "vitest";

import { ProjectPermissionSub } from "@app/ee/services/permission/project-permission";

import { bundleUseTargets, findRolesThatCanUse } from "./agent-vault-role-use-fns";

type TRule = { subject: string; action: string[]; conditions?: Record<string, unknown>; inverted?: boolean };

const role = (id: string, rules: TRule[]) => ({ id, slug: id, name: id, permissions: packRules(rules as never) });

const useBundle1: TRule = {
  subject: ProjectPermissionSub.AgentVaultAccessBundles,
  action: ["use"],
  conditions: { accessBundleId: "b1" }
};

const roles = [
  role("through-bundle", [useBundle1]),
  role("denies-service", [
    useBundle1,
    {
      subject: ProjectPermissionSub.AgentVaultServices,
      action: ["use"],
      conditions: { serviceId: "s1" },
      inverted: true
    }
  ]),
  role("uses-service", [
    { subject: ProjectPermissionSub.AgentVaultServices, action: ["use"], conditions: { serviceId: "s1" } }
  ]),
  role("reads-only", [{ subject: ProjectPermissionSub.AgentVaultServices, action: ["read"] }])
];

const find = (targets: Parameters<typeof findRolesThatCanUse>[1]["targets"]) =>
  findRolesThatCanUse(
    {
      roleDAL: { find: async () => roles } as never,
      agentVaultAccessBundleDAL: {
        countRoleHolders: async () =>
          new Map([
            ["admin", 1],
            ["through-bundle", 2]
          ])
      }
    },
    { projectId: "p", targets }
  );

describe("findRolesThatCanUse", () => {
  const service = { subjectType: ProjectPermissionSub.AgentVaultServices, field: "serviceId", id: "s1" } as const;

  test("lists Admin, a role that uses the service directly, and one that uses a bundle holding it", async () => {
    const found = await find([service, ...bundleUseTargets(["b1"])]);
    expect(found.map((entry) => entry.slug)).toEqual(["admin", "through-bundle", "uses-service"]);
    expect(found.map((entry) => entry.memberCount)).toEqual([1, 2, 0]);
  });

  test("leaves out a role that uses the bundle but denies the service in it", async () => {
    const found = await find([service, ...bundleUseTargets(["b1"])]);
    expect(found.map((entry) => entry.slug)).not.toContain("denies-service");
  });

  test("a deny on a service doesn't take the bundle itself away", async () => {
    const found = await find(bundleUseTargets(["b1"]));
    expect(found.map((entry) => entry.slug)).toEqual(["admin", "through-bundle", "denies-service"]);
  });
});
