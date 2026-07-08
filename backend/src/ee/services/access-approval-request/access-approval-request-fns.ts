import { PackRule, unpackRules } from "@casl/ability/extra";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import { CASL_ACTION_SCHEMA_ENUM, CASL_ACTION_SCHEMA_NATIVE_ENUM } from "../permission/permission-schemas";
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
};

// Exactly the conditions shape RequestAccessForm.tsx ever produces:
// { environment: data.environmentSlug, secretPath: { $glob: data.secretPath } }.
// .strict() at both levels so no other operator ($in/$eq/...) or key
// (secretName, secretTags, connectionId, metadata, ...) can be smuggled in.
const AccessApprovalRequestConditionsSchema = z
  .object({
    environment: z.string().min(1),
    secretPath: z.object({ $glob: z.string().min(1) }).strict()
  })
  .strict();

// The exact resources/actions the Request Access sheet's RESOURCE_CONFIGS can submit.
// Access requests ask an approver to grant elevated access, so unlike custom project
// roles this must not accept arbitrary CASL subjects/actions (Member/GrantPrivileges,
// Kms, Role, etc). Every ProjectPermissionSub not listed below is rejected automatically:
// z.discriminatedUnion has no catch-all branch, so any other subject literal fails with
// Zod's own "Invalid discriminator value" issue.
export const AccessApprovalRequestPermissionSchema = z.discriminatedUnion("subject", [
  z.object({
    subject: z.literal(ProjectPermissionSub.Secrets),
    action: CASL_ACTION_SCHEMA_ENUM([
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Delete
    ]),
    conditions: AccessApprovalRequestConditionsSchema
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretFolders),
    action: CASL_ACTION_SCHEMA_ENUM([
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete
    ]),
    conditions: AccessApprovalRequestConditionsSchema
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.DynamicSecrets),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionDynamicSecretActions),
    conditions: AccessApprovalRequestConditionsSchema
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretRotation),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretRotationActions),
    conditions: AccessApprovalRequestConditionsSchema
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretImports),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions),
    conditions: AccessApprovalRequestConditionsSchema
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.HoneyTokens),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionHoneyTokenActions),
    conditions: AccessApprovalRequestConditionsSchema
  })
]);

// unpackRules always splits subject/action on "," (even a single value becomes a
// 1-element array), so a crafted packed tuple like ["read", "secrets,member", {...}]
// unpacks to subject: ["secrets", "member"]. Require exactly one subject per rule so
// that can't slip a second, forbidden subject past validation while still being
// persisted verbatim.
const parseAccessApprovalRequestPermissions = (permissions: TUnpackedAccessApprovalRequestRule[]) =>
  permissions.map((rule) => {
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];

    if (subjects.length !== 1) {
      throw new BadRequestError({
        message: "Each permission rule in an access request must target exactly one resource type"
      });
    }

    const result = AccessApprovalRequestPermissionSchema.safeParse({
      subject: subjects[0],
      action: actions,
      conditions: rule.conditions
    });

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
