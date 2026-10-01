import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { z } from "zod";

import { TemporaryPermissionMode } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";

import { ApprovalPolicyType, ApprovalRequestGrantStatus } from "../approval-policy-enums";
import { TApprovalRequestGrantsDALFactory } from "../approval-request-dal";
import { SecretAccessPolicyRequestDataSchema } from "./secret-access-policy-schemas";
import { TSecretAccessPolicyConstraints, TSecretAccessRequestData } from "./secret-access-policy-types";

const StoredRequestDataSchema = z.object({ version: z.literal(1), requestData: SecretAccessPolicyRequestDataSchema });

export const parseSecretAccessRequestData = (requestData: unknown): TSecretAccessRequestData | null => {
  const parsed = StoredRequestDataSchema.safeParse(requestData);
  return parsed.success ? parsed.data.requestData : null;
};

export const getSecretAccessRequestData = ({ requestData }: { requestData?: unknown }): TSecretAccessRequestData => {
  const data = parseSecretAccessRequestData(requestData);
  if (!data) {
    throw new BadRequestError({ message: "The access request is malformed and cannot be processed" });
  }
  return data;
};

// jsonb does not preserve object key order, so a stored permission set has to be
// compared against the incoming one on a canonical form rather than raw JSON text.
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])])
    );
  }
  return value;
};

export const hasSameAccessCriteria = (
  data: TSecretAccessRequestData | null,
  criteria: Pick<TSecretAccessRequestData, "permissions" | "isTemporary">
) => {
  if (!data) return false;
  return (
    data.isTemporary === criteria.isTemporary &&
    JSON.stringify(canonicalize(data.permissions)) === JSON.stringify(canonicalize(criteria.permissions))
  );
};

export const validateSecretAccessConstraints = (
  { maxTimePeriod }: Pick<TSecretAccessPolicyConstraints, "maxTimePeriod">,
  { temporaryRange }: Pick<TSecretAccessRequestData, "temporaryRange">
): { valid: boolean; errors?: string[] } => {
  const errors: string[] = [];

  if (maxTimePeriod && (!temporaryRange || ms(temporaryRange) > ms(maxTimePeriod))) {
    errors.push(`Requested access time range is limited to ${maxTimePeriod} by policy`);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
};

export const getSecretAccessGrantWindow = (
  { isTemporary, temporaryRange }: Pick<TSecretAccessRequestData, "isTemporary" | "temporaryRange">,
  now: Date = new Date()
) => {
  if (isTemporary && !temporaryRange) {
    throw new BadRequestError({ message: "Temporary range is required for temporary access" });
  }
  if (!temporaryRange) return null;

  return {
    temporaryRange,
    startTime: now,
    endTime: new Date(now.getTime() + ms(temporaryRange))
  };
};

type TCreateSecretAccessGrantWithPrivilegeDep = {
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "create">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "create">;
};

export const createSecretAccessGrantWithPrivilege = async (
  {
    projectId,
    requestId,
    granteeUserId,
    data
  }: {
    projectId: string;
    requestId: string;
    granteeUserId: string;
    data: TSecretAccessRequestData;
  },
  { approvalRequestGrantsDAL, additionalPrivilegeDAL }: TCreateSecretAccessGrantWithPrivilegeDep,
  tx: Knex
) => {
  const grantWindow = getSecretAccessGrantWindow(data);

  const grant = await approvalRequestGrantsDAL.create(
    {
      projectId,
      requestId,
      granteeUserId,
      status: ApprovalRequestGrantStatus.Active,
      type: ApprovalPolicyType.SecretAccess,
      attributes: data,
      expiresAt: grantWindow?.endTime ?? null
    },
    tx
  );

  await additionalPrivilegeDAL.create(
    {
      actorUserId: granteeUserId,
      projectId,
      name: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
      permissions: JSON.stringify(data.permissions),
      grantId: grant.id,
      ...(grantWindow && {
        isTemporary: true,
        temporaryMode: TemporaryPermissionMode.Relative,
        temporaryRange: grantWindow.temporaryRange,
        temporaryAccessStartTime: grantWindow.startTime,
        temporaryAccessEndTime: grantWindow.endTime
      })
    },
    tx
  );
};
