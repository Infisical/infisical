import { PackRule, unpackRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { z } from "zod";

import { TAccessApprovalRequests, TemporaryPermissionMode } from "@app/db/schemas";
import { PermissionConditionOperators } from "@app/lib/casl";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { slugSchema } from "@app/server/lib/schemas";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";

import { getExternalApprovalProviderName } from "../external-approval/external-approval-map";
import { TExternalApprovalPolicyDALFactory } from "../external-approval/external-approval-policy-dal";
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
import type { TAccessApprovalRequestDALFactory } from "./access-approval-request-dal";
import { ApprovalStatus, TVerifyPermission } from "./access-approval-request-types";

export const toExternalApprovalProvider = (type: string) => ({
  externalApprovalProvider: getExternalApprovalProviderName(type)
});

export const toExternalApprovalAuditLabels = ({
  requestedByUser,
  policyName,
  externalId,
  connectionName
}: {
  requestedByUser: { email?: string | null; username: string };
  policyName: string;
  externalId?: string | null;
  connectionName?: string | null;
}) => ({
  requesterEmail: requestedByUser.email || requestedByUser.username,
  policyName,
  ...(externalId ? { externalId } : {}),
  ...(connectionName ? { connectionName } : {})
});

export const getExternalApprovalProvider = async (
  externalApprovalPolicyDAL: Pick<TExternalApprovalPolicyDALFactory, "findById">,
  externalApprovalPolicyId: string
) => {
  const externalApprovalPolicy = await externalApprovalPolicyDAL.findById(externalApprovalPolicyId);
  if (!externalApprovalPolicy) {
    throw new NotFoundError({
      message: `External approval policy with ID '${externalApprovalPolicyId}' not found`
    });
  }

  return toExternalApprovalProvider(externalApprovalPolicy.type);
};

const ACCESS_REQUEST_SECRET_PATH_MAX_LENGTH = 512;

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
// The $glob value reuses the same validator as every other permission surface, with the length cap
// added here rather than on the shared schema so the tightening stays local.
const AccessApprovalRequestConditionsSchema = z
  .object({
    environment: slugSchema({ max: 64, field: "Environment slug", trim: false }),
    secretPath: z
      .object({
        $glob: z
          .string()
          .max(ACCESS_REQUEST_SECRET_PATH_MAX_LENGTH, {
            message: `Secret path must be ${ACCESS_REQUEST_SECRET_PATH_MAX_LENGTH} or fewer characters`
          })
          .pipe(PermissionConditionSchema[PermissionConditionOperators.$GLOB])
      })
      .strict()
  })
  .strict();

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
  try {
    validateHandlebarTemplate("Access Request Permissions", JSON.stringify(permissions ?? []), {
      allowedExpressions: () => false,
      allowedHelpers: [],
      rejectUnescaped: true
    });
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({ message: "Requested permissions contain a malformed template expression" });
  }

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

  const requestedPermissions = Array.from(actionsBySubject.entries()).map(([subject, actions]) => ({
    subject,
    actions: Array.from(actions)
  }));

  return {
    envSlug: permissionEnv,
    secretPath: permissionSecretPath,
    accessTypes,
    requestedPermissions
  };
};

type TGrantApprovedRequestPrivilege = {
  accessApprovalRequestDAL: Pick<TAccessApprovalRequestDALFactory, "findByIdForUpdate" | "updateById">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "create">;
  accessApprovalRequest: Pick<
    TAccessApprovalRequests,
    "id" | "isTemporary" | "temporaryRange" | "requestedByUserId" | "permissions"
  > & { projectId: string };
  approvedByUserId: string | null;
  bypassReason: string | null;
};

export const grantApprovedRequestPrivilege = async (
  {
    accessApprovalRequestDAL,
    additionalPrivilegeDAL,
    accessApprovalRequest,
    approvedByUserId,
    bypassReason
  }: TGrantApprovedRequestPrivilege,
  tx: Knex
) => {
  const currentRequestState = await accessApprovalRequestDAL.findByIdForUpdate(accessApprovalRequest.id, tx);
  if (!currentRequestState) {
    throw new NotFoundError({ message: `Access approval request with ID '${accessApprovalRequest.id}' not found` });
  }
  if (currentRequestState.status !== ApprovalStatus.PENDING) {
    throw new BadRequestError({ message: "The request has been closed" });
  }
  if (currentRequestState.privilegeId) return currentRequestState;

  if (accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
    throw new BadRequestError({ message: "Temporary range is required for temporary access" });
  }

  let privilegeId: string;
  if (!accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
    const privilege = await additionalPrivilegeDAL.create(
      {
        actorUserId: accessApprovalRequest.requestedByUserId,
        projectId: accessApprovalRequest.projectId,
        name: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
        permissions: JSON.stringify(accessApprovalRequest.permissions)
      },
      tx
    );
    privilegeId = privilege.id;
  } else {
    const relativeTempAllocatedTimeInMs = ms(accessApprovalRequest.temporaryRange!);
    const startTime = new Date();

    const privilege = await additionalPrivilegeDAL.create(
      {
        actorUserId: accessApprovalRequest.requestedByUserId,
        projectId: accessApprovalRequest.projectId,
        name: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
        permissions: JSON.stringify(accessApprovalRequest.permissions),
        isTemporary: true,
        temporaryMode: TemporaryPermissionMode.Relative,
        temporaryRange: accessApprovalRequest.temporaryRange!,
        temporaryAccessStartTime: startTime,
        temporaryAccessEndTime: new Date(startTime.getTime() + relativeTempAllocatedTimeInMs)
      },
      tx
    );
    privilegeId = privilege.id;
  }

  return accessApprovalRequestDAL.updateById(
    accessApprovalRequest.id,
    {
      privilegeId,
      status: ApprovalStatus.APPROVED,
      approvedAt: new Date(),
      approvedByUserId,
      bypassReason
    },
    tx
  );
};
