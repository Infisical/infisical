import { PackRule, unpackRules } from "@casl/ability/extra";
import { z } from "zod";

import { PermissionConditionOperators } from "@app/lib/casl";
import { BadRequestError } from "@app/lib/errors";

import { CASL_ACTION_SCHEMA_NATIVE_ENUM } from "../permission/permission-schemas";
import { PermissionConditionSchema } from "../permission/permission-types";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TVerifyPermission } from "./access-approval-request-types";

// Turn a permission slug into a human-readable label, e.g. "dynamic-secrets" -> "Dynamic Secrets"
// and "read-root-credential" -> "Read Root Credential". Used for review notifications.
const humanizeSlug = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");

type TUnpackedAccessApprovalRequestRule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conditions?: Record<string, any>;
  action: string | string[];
  subject: string | string[];
  inverted?: boolean;
  fields?: string[];
  reason?: string;
};

// Exactly the conditions shape RequestAccessForm.tsx ever produces:
// { environment: data.environmentSlug, secretPath: { $glob: data.secretPath } }.
// .strict() at both levels so no other operator ($in/$eq/...) or key
// (secretName, secretTags, connectionId, metadata, ...) can be smuggled in.
// The $glob value reuses the same validator as every other permission surface.
const AccessApprovalRequestConditionsSchema = z
  .object({
    environment: z.string().min(1),
    secretPath: z.object({ $glob: PermissionConditionSchema[PermissionConditionOperators.$GLOB] }).strict()
  })
  .strict();

// Every allowed rule has the same shape: one whitelisted subject, that subject's allowed
// actions, and the exact conditions the form produces. The whole unpacked rule is parsed
// (not a projection of it), with .strict() so no other CASL rule attribute (field-level
// scoping, reasons) can ride along into the privilege that gets granted on approval.
// `inverted` needs an explicit key: unpackRules() stamps `inverted: false` on every rule,
// which strict() would otherwise reject, while a crafted request can smuggle
// `inverted: true` (a "cannot" rule) that must fail; literal(false).optional() allows
// exactly the former and rejects the latter.
// TAction admits `V | V[]` because the CASL_ACTION_SCHEMA_* transforms, while always
// returning an array at runtime, declare their output as the union (generic narrowing).
const accessApprovalRequestRuleSchema = <
  TSub extends ProjectPermissionSub,
  TAction extends z.ZodType<string | string[], z.ZodTypeDef, unknown>
>(
  subject: TSub,
  action: TAction
) =>
  z
    .object({
      subject: z.literal(subject),
      action,
      conditions: AccessApprovalRequestConditionsSchema,
      inverted: z.literal(false).optional()
    })
    .strict();

// The exact resources/actions the Request Access sheet's RESOURCE_CONFIGS can submit.
// Access requests ask an approver to grant elevated access, so unlike custom project
// roles this must not accept arbitrary CASL subjects/actions (Member/GrantPrivileges,
// Kms, Role, etc). Every ProjectPermissionSub not listed below is rejected automatically:
// z.discriminatedUnion has no catch-all branch, so any other subject literal fails with
// Zod's own "Invalid discriminator value" issue.
const AccessApprovalRequestPermissionSchema = z.discriminatedUnion("subject", [
  accessApprovalRequestRuleSchema(
    ProjectPermissionSub.Secrets,
    CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretActions)
  ),
  accessApprovalRequestRuleSchema(
    ProjectPermissionSub.SecretFolders,
    CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions)
  ),
  accessApprovalRequestRuleSchema(
    ProjectPermissionSub.DynamicSecrets,
    CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionDynamicSecretActions)
  ),
  accessApprovalRequestRuleSchema(
    ProjectPermissionSub.SecretRotation,
    CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretRotationActions)
  ),
  accessApprovalRequestRuleSchema(
    ProjectPermissionSub.SecretImports,
    CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions)
  ),
  accessApprovalRequestRuleSchema(
    ProjectPermissionSub.HoneyTokens,
    CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionHoneyTokenActions)
  )
]);

// unpackRules always splits subject/action on "," (even a single value becomes a
// 1-element array), so a crafted packed tuple like ["read", "secrets,member", {...}]
// unpacks to subject: ["secrets", "member"]. Require exactly one subject per rule so
// that can't slip a second, forbidden subject past validation while still being
// persisted verbatim.
const parseAccessApprovalRequestPermissions = (permissions: TUnpackedAccessApprovalRequestRule[]) =>
  permissions.map((rule) => {
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];

    if (subjects.length !== 1) {
      throw new BadRequestError({
        message: "Each permission rule in an access request must target exactly one resource type"
      });
    }

    const result = AccessApprovalRequestPermissionSchema.safeParse({ ...rule, subject: subjects[0] });

    if (!result.success) {
      throw new BadRequestError({
        message: `The requested permission for resource "${subjects[0]}" is not allowed. Access requests may only target Secrets, Secret Folders, Dynamic Secrets, Secret Rotation, Secret Imports, or Honey Tokens, using the actions and "environment"/"secretPath" conditions available in the Request Access form.`,
        details: result.error.issues
      });
    }

    return result.data;
  });

export const verifyRequestedPermissions = ({ permissions }: TVerifyPermission) => {
  const permission = unpackRules(permissions as PackRule<TUnpackedAccessApprovalRequestRule>[]);

  if (!permission || !permission.length) {
    throw new BadRequestError({ message: "No permission provided" });
  }

  const validatedPermissions = parseAccessApprovalRequestPermissions(permission);

  const firstPermission = validatedPermissions[0];
  const permissionEnv = firstPermission.conditions.environment;
  const permissionSecretPath = firstPermission.conditions.secretPath.$glob;

  // Collect every requested subject and its actions (not just secret CRUD) so the approval
  // notifications surface the full scope of access being requested and nothing is hidden.
  const actionsBySubject = new Map<string, Set<string>>();

  for (const p of validatedPermissions) {
    const ruleEnv = p.conditions.environment;
    const rulePath = p.conditions.secretPath.$glob;

    if (ruleEnv !== permissionEnv || rulePath !== permissionSecretPath) {
      throw new BadRequestError({
        message: "All permission rules must target the same environment and secret path"
      });
    }

    // runtime is always an array; the schema's declared output keeps the bare-value union
    const actions = Array.isArray(p.action) ? p.action : [p.action];
    const subjectActions = actionsBySubject.get(p.subject) ?? new Set<string>();
    actions.forEach((action) => subjectActions.add(action));
    actionsBySubject.set(p.subject, subjectActions);
  }

  const accessTypes = Array.from(actionsBySubject.entries()).map(
    ([subject, actions]) =>
      `${humanizeSlug(subject)} (${Array.from(actions)
        .map((action) => humanizeSlug(action))
        .join(", ")})`
  );

  return {
    envSlug: permissionEnv,
    secretPath: permissionSecretPath,
    accessTypes
  };
};
