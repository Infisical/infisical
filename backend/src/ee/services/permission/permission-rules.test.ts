import { createMongoAbility, MongoAbility, RawRuleOf, subject as s } from "@casl/ability";
import { packRules, unpackRules } from "@casl/ability/extra";

import { conditionsMatcher } from "@app/lib/casl";

import { ProjectPermissionSet } from "./project-permission";

/**
 * Replicates the rule-building logic from permission-service.ts buildProjectPermissionRules
 * for custom roles, to test determinism of permission evaluation.
 */
function buildRulesFromCustomRoles(
  roles: { permissions: ReturnType<typeof packRules> }[]
): RawRuleOf<MongoAbility<ProjectPermissionSet>>[] {
  return roles
    .map(({ permissions }) => unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(permissions))
    .reduce((prev, curr) => prev.concat(curr), [])
    .sort((a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted)));
}

describe("RBAC permission rule ordering (#4856)", () => {
  // https://github.com/Infisical/infisical/issues/4856
  // Machine identity permissions must be deterministic regardless of DB row order.

  const allowBothPacked = packRules([{ action: ["describe", "readValue"] as string[], subject: "Secret" as string }]);

  const denyReadPacked = packRules([{ action: "readValue" as string, subject: "Secret" as string, inverted: true }]);

  test("deny wins regardless of role order — no conditions", () => {
    for (const order of [
      [{ permissions: denyReadPacked }, { permissions: allowBothPacked }],
      [{ permissions: allowBothPacked }, { permissions: denyReadPacked }]
    ]) {
      const rules = buildRulesFromCustomRoles(order);
      const ability = createMongoAbility(rules);
      expect(ability.can("readValue", "Secret")).toBe(false);
      expect(ability.can("describe", "Secret")).toBe(true);
    }
  });

  test("deny wins regardless of role order — with $glob conditionsMatcher", () => {
    const allowWithGlob = packRules([
      {
        action: ["describe", "readValue"] as string[],
        subject: "Secret" as string,
        conditions: { secretPath: { $glob: "/**" } }
      }
    ]);

    const denyWithGlob = packRules([
      {
        action: "readValue" as string,
        subject: "Secret" as string,
        inverted: true,
        conditions: { secretPath: { $glob: "/**" } }
      }
    ]);

    for (const order of [
      [{ permissions: denyWithGlob }, { permissions: allowWithGlob }],
      [{ permissions: allowWithGlob }, { permissions: denyWithGlob }]
    ]) {
      const rules = buildRulesFromCustomRoles(order);
      const ability = createMongoAbility(rules, { conditionsMatcher });
      expect(ability.can("readValue", s("Secret", { secretPath: "/test" }))).toBe(false);
      expect(ability.can("describe", s("Secret", { secretPath: "/test" }))).toBe(true);
    }
  });

  test("narrow deny (/prod/**) should not block broad allow (/**) on non-matching paths", () => {
    const allowAll = packRules([
      {
        action: "readValue" as string,
        subject: "Secret" as string,
        conditions: { secretPath: { $glob: "/**" } }
      }
    ]);
    const denyProd = packRules([
      {
        action: "readValue" as string,
        subject: "Secret" as string,
        inverted: true,
        conditions: { secretPath: { $glob: "/prod/**" } }
      }
    ]);

    for (const order of [
      [{ permissions: allowAll }, { permissions: denyProd }],
      [{ permissions: denyProd }, { permissions: allowAll }]
    ]) {
      const rules = buildRulesFromCustomRoles(order);
      const ability = createMongoAbility(rules, { conditionsMatcher });
      // /dev should be allowed — deny only applies to /prod/**
      expect(ability.can("readValue", s("Secret", { secretPath: "/dev/secret" }))).toBe(true);
      // /prod should be denied
      expect(ability.can("readValue", s("Secret", { secretPath: "/prod/secret" }))).toBe(false);
    }
  });

  test("all 6 orderings of 3 roles produce identical permissions", () => {
    const allowRead = packRules([{ action: "readValue" as string, subject: "Secret" as string }]);
    const allowDescribe = packRules([{ action: "describe" as string, subject: "Secret" as string }]);
    const denyRead = packRules([{ action: "readValue" as string, subject: "Secret" as string, inverted: true }]);

    const rolePerms = [{ permissions: allowRead }, { permissions: allowDescribe }, { permissions: denyRead }];

    const orderings = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0]
    ];

    for (const order of orderings) {
      const roles = order.map((i) => rolePerms[i]);
      const rules = buildRulesFromCustomRoles(roles);
      const ability = createMongoAbility(rules);
      expect(ability.can("readValue", "Secret")).toBe(false);
      expect(ability.can("describe", "Secret")).toBe(true);
    }
  });
});
