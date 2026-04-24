import { createMongoAbility } from "@casl/ability";

import { BadRequestError } from "@app/lib/errors";

import { PermissionConditionOperators } from ".";
import { getProcessedPermissionRules } from "./permission-filter-utils";

describe("getProcessedPermissionRules", () => {
  const action = "read";
  const subject = "certificates";

  test("translates $glob condition on a regular field into allowRules with empty metadataFilter", () => {
    const ability = createMongoAbility([
      {
        action,
        subject,
        conditions: {
          commonName: { [PermissionConditionOperators.$GLOB]: "prod-*" }
        }
      }
    ]);

    const result = getProcessedPermissionRules(ability, action, subject);

    expect(result.forbidRules).toHaveLength(0);
    expect(result.metadataFilter).toEqual([]);
    expect(result.allowRules).toHaveLength(1);
    expect(result.allowRules[0].commonName).toHaveLength(1);
    expect(result.allowRules[0].commonName[0]).toMatchObject({ operator: "LIKE", value: "prod-*", isPattern: true });
  });

  test("extracts metadata $elemMatch into metadataFilter (single entry)", () => {
    const ability = createMongoAbility([
      {
        action,
        subject,
        conditions: {
          metadata: {
            [PermissionConditionOperators.$ELEMENTMATCH]: {
              key: { [PermissionConditionOperators.$EQ]: "env" },
              value: { [PermissionConditionOperators.$EQ]: "prod" }
            }
          }
        }
      }
    ]);

    const result = getProcessedPermissionRules(ability, action, subject);

    expect(result.metadataFilter).toEqual([{ key: "env", value: "prod" }]);
    // The metadata field itself must not leak into SQL-translated allowRules.
    expect(result.allowRules.every((rule) => !("metadata" in rule))).toBe(true);
  });

  test("expands $in under $elemMatch.value into multiple entries", () => {
    const ability = createMongoAbility([
      {
        action,
        subject,
        conditions: {
          metadata: {
            [PermissionConditionOperators.$ELEMENTMATCH]: {
              key: { [PermissionConditionOperators.$EQ]: "env" },
              value: { [PermissionConditionOperators.$IN]: ["prod", "staging"] }
            }
          }
        }
      }
    ]);

    const result = getProcessedPermissionRules(ability, action, subject);

    expect(result.metadataFilter).toEqual([
      { key: "env", value: "prod" },
      { key: "env", value: "staging" }
    ]);
  });

  test("handles $elemMatch with only a key constraint (no value)", () => {
    const ability = createMongoAbility([
      {
        action,
        subject,
        conditions: {
          metadata: {
            [PermissionConditionOperators.$ELEMENTMATCH]: {
              key: { [PermissionConditionOperators.$EQ]: "env" }
            }
          }
        }
      }
    ]);

    const result = getProcessedPermissionRules(ability, action, subject);

    expect(result.metadataFilter).toEqual([{ key: "env" }]);
  });

  test("combined conditions populate both allowRules and metadataFilter", () => {
    const ability = createMongoAbility([
      {
        action,
        subject,
        conditions: {
          commonName: { [PermissionConditionOperators.$GLOB]: "prod-*" },
          metadata: {
            [PermissionConditionOperators.$ELEMENTMATCH]: {
              key: { [PermissionConditionOperators.$EQ]: "env" },
              value: { [PermissionConditionOperators.$EQ]: "prod" }
            }
          }
        }
      }
    ]);

    const result = getProcessedPermissionRules(ability, action, subject);

    expect(result.allowRules).toHaveLength(1);
    expect(result.allowRules[0].commonName).toHaveLength(1);
    expect(result.metadataFilter).toEqual([{ key: "env", value: "prod" }]);
  });

  test("throws BadRequestError on unknown operator in a condition", () => {
    const ability = createMongoAbility([
      {
        action,
        subject,
        conditions: {
          commonName: { $notAThing: "x" } as unknown as Record<string, unknown>
        }
      }
    ]);

    expect(() => getProcessedPermissionRules(ability, action, subject)).toThrow(BadRequestError);
    expect(() => getProcessedPermissionRules(ability, action, subject)).toThrow(/Unknown CASL operator/);
  });
});
