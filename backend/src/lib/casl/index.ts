/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { buildMongoQueryMatcher, MongoAbility } from "@casl/ability";
import { FieldCondition, FieldInstruction, JsInterpreter } from "@ucast/mongo2js";
import picomatch from "picomatch";

const $glob: FieldInstruction<string> = {
  type: "field",
  validate(instruction, value) {
    if (typeof value !== "string") {
      throw new Error(`"${instruction.name}" expects value to be a string`);
    }
  }
};

const glob: JsInterpreter<FieldCondition<string>> = (node, object, context) => {
  const secretPath = context.get(object, node.field) as string;
  const permissionSecretGlobPath = node.value;
  return picomatch.isMatch(secretPath, permissionSecretGlobPath, { strictSlashes: false });
};

export const conditionsMatcher = buildMongoQueryMatcher({ $glob }, { glob });

/**
 * Extracts and formats permissions from a CASL Ability object or a raw permission set.
 */
const extractPermissions = (ability: MongoAbility) => {
  const permissions: string[] = [];
  ability.rules.forEach((permission) => {
    if (typeof permission.action === "string") {
      permissions.push(`${permission.action}_${permission.subject as string}`);
    } else {
      permission.action.forEach((permissionAction) => {
        permissions.push(`${permissionAction}_${permission.subject as string}`);
      });
    }
  });
  return permissions;
};

/**
 * Compares two sets of permissions to determine if the first set is at least as privileged as the second set.
 * The function checks if all permissions in the second set are contained within the first set and if the first set has equal or more permissions.
 *
 */
export const isAtLeastAsPrivileged = (permissions1: MongoAbility, permissions2: MongoAbility) => {
  const set1 = new Set(extractPermissions(permissions1));
  const set2 = new Set(extractPermissions(permissions2));

  for (const perm of set2) {
    if (!set1.has(perm)) {
      return false;
    }
  }

  return set1.size >= set2.size;
};
