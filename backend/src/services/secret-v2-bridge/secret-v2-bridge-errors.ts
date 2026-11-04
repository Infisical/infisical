import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError } from "@app/lib/errors";
import { findPostgresConstraintViolation } from "@app/lib/errors/postgres";
import { ConstraintTarget } from "@app/services/secret-validation-rule/secret-validation-rule-enums";
import {
  describeSecretValidationFailures,
  describeSecretValidationViolation,
  TCanDescribeLocation,
  TSecretValidationFailure
} from "@app/services/secret-validation-rule/secret-validation-rule-errors";
import { TSecretToValidate } from "@app/services/secret-validation-rule/secret-validation-rule-types";

// Clients branch on these, so they are part of the API contract: add new codes, never rename one.
export enum SecretWriteErrorCode {
  SecretAlreadyExists = "SECRET_ALREADY_EXISTS",
  SecretValidationFailed = "SECRET_VALIDATION_FAILED",
  SecretReadOnly = "SECRET_READ_ONLY"
}

export enum SecretWriteErrorField {
  SecretKey = "secretKey",
  SecretValue = "secretValue"
}

// `secretKey` is the key the request used for the secret, so a client can find the row it submitted
// even when the failure is about the new name of a rename.
export type TSecretWriteFieldError = {
  secretKey: string;
  environment: string;
  field: SecretWriteErrorField;
  code: string;
  message: string;
};

const SHARED_SECRET_KEY_UNIQUE_INDEX = "uq_secrets_v2_key_folder_id_shared";

type TSecretKeyConflict = {
  secretKey: string;
  newSecretName?: string;
};

export const secretAlreadyExistsError = ({
  conflicts,
  environment,
  secretPath,
  message
}: {
  conflicts: TSecretKeyConflict[];
  environment: string;
  secretPath: string;
  message?: string;
}) => {
  const takenKeys = conflicts.map((el) => `'${el.newSecretName ?? el.secretKey}'`).join(", ");

  return new BadRequestError({
    message: message ?? `Secret already exists: ${takenKeys} in path '${secretPath}' of environment '${environment}'`,
    code: SecretWriteErrorCode.SecretAlreadyExists,
    details: {
      fieldErrors: conflicts.map((el): TSecretWriteFieldError => ({
        secretKey: el.secretKey,
        environment,
        field: SecretWriteErrorField.SecretKey,
        code: SecretWriteErrorCode.SecretAlreadyExists,
        message: `Secret '${el.newSecretName ?? el.secretKey}' already exists in path '${secretPath}' of environment '${environment}'`
      }))
    }
  });
};

// The existence checks run before the write, so two concurrent writes of one key can both pass them and
// the second is stopped by the unique index instead. That is the same mistake, so it gets the same error.
export const toSecretKeyConflictError = (
  error: unknown,
  {
    candidates,
    environment,
    secretPath
  }: {
    candidates: TSecretKeyConflict[];
    environment: string;
    secretPath: string;
  }
) => {
  const violation = findPostgresConstraintViolation(
    error,
    DatabaseErrorCode.UniqueViolation,
    SHARED_SECRET_KEY_UNIQUE_INDEX
  );
  if (!violation || !candidates.length) return error;

  // Postgres reports the clashing row as `Key (key, "folderId")=(<key>, <folderId>) already exists.`
  const detail = typeof violation.detail === "string" ? violation.detail : "";
  const conflictingKey = detail.match(/=\((.*), [0-9a-f-]{36}\) already exists/)?.[1];
  const conflicts = candidates.filter((el) => (el.newSecretName ?? el.secretKey) === conflictingKey);

  return secretAlreadyExistsError({
    conflicts: conflicts.length ? conflicts : candidates,
    environment,
    secretPath
  });
};

export const describeMissingTags = (tagIds: string[], foundTags: { id: string }[]) => {
  const foundIds = new Set(foundTags.map((el) => el.id));
  const missingIds = [...new Set(tagIds)].filter((id) => !foundIds.has(id));
  if (!missingIds.length) return "Each tag can only be listed once per secret";
  return `Tag not found in this project: ${missingIds.map((id) => `'${id}'`).join(", ")}`;
};

export const secretValidationFailedError = (
  failures: TSecretValidationFailure[],
  { environment, secrets = [] }: { environment: string; secrets?: TSecretToValidate[] },
  canDescribeLocation: TCanDescribeLocation
) => {
  const requestKeys = new Map(secrets.map((el) => [el.key, el.requestKey ?? el.key]));

  return new BadRequestError({
    message: describeSecretValidationFailures(failures, canDescribeLocation),
    code: SecretWriteErrorCode.SecretValidationFailed,
    details: {
      fieldErrors: failures.map((failure): TSecretWriteFieldError => ({
        secretKey: requestKeys.get(failure.secretKey) ?? failure.secretKey,
        environment,
        field:
          failure.violation.target === ConstraintTarget.SecretKey
            ? SecretWriteErrorField.SecretKey
            : SecretWriteErrorField.SecretValue,
        code: failure.violation.kind,
        message: describeSecretValidationViolation(failure, canDescribeLocation)
      }))
    }
  });
};

export const secretReadOnlyError = ({
  secrets,
  environment,
  message
}: {
  secrets: {
    secretKey: string;
    isHoneyTokenSecret?: boolean | null;
    fields: SecretWriteErrorField[];
  }[];
  environment: string;
  message: string;
}) =>
  new BadRequestError({
    message,
    code: SecretWriteErrorCode.SecretReadOnly,
    details: {
      fieldErrors: secrets.flatMap(({ secretKey, isHoneyTokenSecret, fields }) =>
        fields.map((field): TSecretWriteFieldError => ({
          secretKey,
          environment,
          field,
          code: SecretWriteErrorCode.SecretReadOnly,
          message: `Secret '${secretKey}' is a ${isHoneyTokenSecret ? "honey token" : "rotated"} secret, so its ${
            field === SecretWriteErrorField.SecretKey ? "name" : "value"
          } cannot be changed`
        }))
      )
    }
  });

// Rotated and honey token secrets are written by their rotation or honey token, so a request may change their
// tags or comment but not their name or value. Resending the current name or value is not a change, so a full
// re-apply of an environment still succeeds. The value is only compared for a caller who may read it; otherwise
// the answer would confirm guesses at a hidden value.
export const throwIfReadOnlySecretEdits = ({
  storedSecrets,
  updates,
  decryptValue,
  canReadValue,
  environment,
  secretPath
}: {
  storedSecrets: {
    key: string;
    tags?: { slug: string }[];
    encryptedValue?: Buffer | null;
    isRotatedSecret?: boolean | null;
    isHoneyTokenSecret?: boolean | null;
  }[];
  updates: { secretKey: string; newSecretName?: string; secretValue?: string }[];
  decryptValue: (encryptedValue: Buffer) => string;
  canReadValue: (secret: { key: string; tags?: { slug: string }[] }) => boolean;
  environment: string;
  secretPath: string;
}) => {
  const readOnlyEdits = storedSecrets.flatMap((el) => {
    if (!el.isHoneyTokenSecret && !el.isRotatedSecret) return [];
    const update = updates.find((i) => i.secretKey === el.key);
    if (!update) return [];
    const isRenamed = Boolean(update.newSecretName) && update.newSecretName !== el.key;
    const isValueChanged =
      update.secretValue !== undefined &&
      (!canReadValue(el) || update.secretValue !== (el.encryptedValue ? decryptValue(el.encryptedValue) : ""));
    const fields = [
      ...(isRenamed ? [SecretWriteErrorField.SecretKey] : []),
      ...(isValueChanged ? [SecretWriteErrorField.SecretValue] : [])
    ];
    return fields.length ? [{ secretKey: el.key, isHoneyTokenSecret: el.isHoneyTokenSecret, fields }] : [];
  });
  if (!readOnlyEdits.length) return;

  throw secretReadOnlyError({
    secrets: readOnlyEdits,
    environment,
    message: `Cannot update the name or value of rotated or honey token secrets: ${readOnlyEdits
      .map((el) => `'${el.secretKey}'`)
      .join(", ")} in path '${secretPath}' of environment '${environment}'`
  });
};
