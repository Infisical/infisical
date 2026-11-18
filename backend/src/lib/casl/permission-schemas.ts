import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import picomatch from "picomatch";
import { z } from "zod";

import { PermissionConditionOperators } from "./index";

export const CASL_ACTION_SCHEMA_NATIVE_ENUM = <ACTION extends z.EnumLike>(actions: ACTION) =>
  z
    .union([z.nativeEnum(actions), z.nativeEnum(actions).array().min(1)])
    .transform((el) => (typeof el === "string" ? [el] : el));

export const CASL_ACTION_SCHEMA_ENUM = <ACTION extends z.EnumValues>(actions: ACTION) =>
  z.union([z.enum(actions), z.enum(actions).array().min(1)]).transform((el) => (typeof el === "string" ? [el] : el));

export const PermissionConditionSchema = {
  [PermissionConditionOperators.$IN]: z.string().trim().min(1).array(),
  [PermissionConditionOperators.$ALL]: z.string().trim().min(1).array(),
  [PermissionConditionOperators.$EQ]: z.string().min(1),
  [PermissionConditionOperators.$NEQ]: z.string().min(1),
  [PermissionConditionOperators.$GLOB]: z
    .string()
    .min(1)
    .refine(
      (el) => {
        try {
          picomatch.parse([el]);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid glob pattern" }
    )
};

// One rule as custom roles and privileges store it, unpacked.
export const UnpackedPermissionSchema = z.object({
  subject: z
    .union([z.string().min(1), z.string().array()])
    .transform((el) => (typeof el !== "string" ? el[0] : el))
    .optional(),
  action: z.union([z.string().min(1), z.string().array()]).transform((el) => (typeof el === "string" ? [el] : el)),
  conditions: z.unknown().optional(),
  inverted: z.boolean().optional()
});

export const unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility>>[]));
