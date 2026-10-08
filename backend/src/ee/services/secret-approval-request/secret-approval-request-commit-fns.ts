import { ForbiddenError, MongoAbility, subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, SecretType, TableName, TSecretApprovalRequestsSecretsV2Insert } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { diff, groupBy, unique } from "@app/lib/fn";
import { setKnexStringValue } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SecretOperations } from "@app/services/secret/secret-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { SecretUpdateMode } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import {
  describeSecretValidationFailures,
  SecretValidationError
} from "@app/services/secret-validation-rule/secret-validation-rule-errors";
import { TSecretValidationRuleServiceFactory } from "@app/services/secret-validation-rule/secret-validation-rule-service";
import { TValidateSecretsDTO } from "@app/services/secret-validation-rule/secret-validation-rule-types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "../permission/project-permission";
import { scanSecretPolicyViolations } from "../secret-scanning-v2/secret-scanning-v2-fns";
import { TGenerateSecretApprovalRequestV2BridgeDTO } from "./secret-approval-request-types";

type TSecretApprovalRequestCommitFnsFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findBySecretKeys" | "find">;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "findLatestVersionMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "findManyTagsById">;
  secretValidationRuleService: Pick<TSecretValidationRuleServiceFactory, "validateSecrets">;
};

export type TBuildSecretApprovalCommitsDTO = Omit<
  TGenerateSecretApprovalRequestV2BridgeDTO,
  "policy" | "commitMessage"
> & { trx?: Knex };

export type TSecretApprovalCommit = Omit<TSecretApprovalRequestsSecretsV2Insert, "requestId" | "secretChangeId">;

export type TSecretApprovalRequestCommitFnsFactory = ReturnType<typeof secretApprovalRequestCommitFnsFactory>;

export type TSecretApprovalCommitBundle = Awaited<
  ReturnType<TSecretApprovalRequestCommitFnsFactory["buildSecretApprovalCommits"]>
>;

export const pickApprovalCommitColumns = ({
  version,
  op,
  key,
  encryptedComment,
  skipMultilineEncoding,
  metadata,
  reminderNote,
  reminderRepeatDays,
  encryptedValue,
  secretId,
  secretVersion,
  secretMetadata
}: TSecretApprovalCommit) => ({
  version,
  op,
  secretId,
  metadata,
  secretVersion,
  skipMultilineEncoding,
  encryptedValue,
  reminderRepeatDays,
  reminderNote,
  encryptedComment,
  key,
  secretMetadata
});

export const secretApprovalRequestCommitFnsFactory = ({
  permissionService,
  folderDAL,
  projectDAL,
  kmsService,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  secretTagDAL,
  secretValidationRuleService
}: TSecretApprovalRequestCommitFnsFactoryDep) => {
  // Which secret already holds a duplicated value is only named to a writer who may read there, so the
  // message is resolved against their permission rather than formatted inside validation.
  const $validateSecrets = async (
    dto: TValidateSecretsDTO,
    permission: MongoAbility<ProjectPermissionSet>,
    tx?: Knex
  ) => {
    try {
      await secretValidationRuleService.validateSecrets(dto, tx);
    } catch (error) {
      if (!(error instanceof SecretValidationError)) throw error;

      throw new BadRequestError({
        message: describeSecretValidationFailures(error.failures, (environment, secretPath) =>
          permission.can(
            ProjectPermissionSecretActions.DescribeSecret,
            subject(ProjectPermissionSub.Secrets, { environment, secretPath })
          )
        )
      });
    }
  };

  const buildSecretApprovalCommits = async ({
    data,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    secretPath,
    environment,
    folder: providedFolder,
    updateMode = SecretUpdateMode.FailOnNotFound,
    trx: providedTx
  }: TBuildSecretApprovalCommitsDTO) => {
    if (actor === ActorType.SERVICE)
      throw new BadRequestError({ message: "Cannot use service token over protected branches" });

    const { permission, hasProjectEnforcement } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    const folder = providedFolder ?? (await folderDAL.findBySecretPath(projectId, environment, secretPath, providedTx));
    if (!folder)
      throw new NotFoundError({
        message: `Folder not found for the environment slug '${environment}' & secret path '${secretPath}'`,
        name: "GenSecretApproval"
      });
    const folderId = folder.id;

    if (hasProjectEnforcement("enforceEncryptedSecretManagerSecretMetadata")) {
      const hasMissingEncryptedMetadataInCreate = data[SecretOperations.Create]?.some((secret) =>
        secret.secretMetadata?.some((meta) => !meta.isEncrypted)
      );
      const hasMissingEncryptedMetadataInUpdate = data[SecretOperations.Update]?.some((secret) =>
        secret.secretMetadata?.some((meta) => !meta.isEncrypted)
      );

      if (hasMissingEncryptedMetadataInCreate || hasMissingEncryptedMetadataInUpdate) {
        throw new BadRequestError({
          message:
            "One or more secrets has non-encrypted metadata values. Project requires all metadata to be encrypted."
        });
      }
    }

    const commits: TSecretApprovalCommit[] = [];
    const commitTagIds: Record<string, string[]> = {};
    const existingTagIds: Record<string, string[]> = {};

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey(
      {
        type: KmsDataKey.SecretManager,
        projectId
      },
      providedTx
    );

    const project = await projectDAL.findById(projectId, providedTx);

    // scanSecretPolicyViolations is an expensive operation, so it only runs it if we are not in a transaction
    if (!providedTx) {
      await scanSecretPolicyViolations(
        projectId,
        secretPath,
        [
          ...(data[SecretOperations.Create] || []),
          ...(data[SecretOperations.Update] || []).filter((el) => el.secretValue)
        ].map((el) => ({
          secretKey: el.secretKey,
          secretValue: el.secretValue as string
        })),
        project.secretDetectionIgnoreValues || []
      );
    }

    const secretsToValidate: { key: string; value?: string; secretId?: string }[] = [];

    // for created secret approval change
    const createdSecrets = data[SecretOperations.Create];
    if (createdSecrets && createdSecrets?.length) {
      const secrets = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        createdSecrets.map((el) => ({
          key: el.secretKey,
          type: SecretType.Shared
        })),
        providedTx
      );
      if (secrets.length)
        throw new BadRequestError({
          message: `Secret already exists: ${secrets.map((el) => `'${el.key}'`).join(", ")} in path '${secretPath}' of environment '${environment}'`
        });

      secretsToValidate.push(...createdSecrets.map((s) => ({ key: s.secretKey, value: s.secretValue })));

      commits.push(
        ...createdSecrets.map((createdSecret) => ({
          op: SecretOperations.Create,
          version: 1,
          encryptedComment: setKnexStringValue(
            createdSecret.secretComment,
            (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
          ),
          encryptedValue: setKnexStringValue(
            createdSecret.secretValue,
            (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
          ),
          skipMultilineEncoding: createdSecret.skipMultilineEncoding,
          key: createdSecret.secretKey,
          secretMetadata: JSON.stringify(
            (createdSecret.secretMetadata || [])?.map((meta) => ({
              key: meta.key,
              [meta.isEncrypted ? "encryptedValue" : "value"]: meta.isEncrypted
                ? secretManagerEncryptor({ plainText: Buffer.from(meta.value) }).cipherTextBlob.toString("base64")
                : meta.value
            }))
          ),
          type: SecretType.Shared
        }))
      );
      createdSecrets.forEach(({ tagIds, secretKey }) => {
        if (tagIds?.length) commitTagIds[secretKey] = tagIds;
      });
    }
    const secretsToUpdate = data[SecretOperations.Update];
    if (secretsToUpdate && secretsToUpdate?.length) {
      const secretsToUpdateStoredInDB = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        secretsToUpdate.map((el) => ({
          key: el.secretKey,
          type: SecretType.Shared
        })),
        providedTx
      );

      secretsToUpdateStoredInDB.forEach((el) => {
        if (el.tags?.length) existingTagIds[el.key] = el.tags.map((i) => i.id);
      });

      const existingKeys = new Set(secretsToUpdateStoredInDB.map((el) => el.key));
      const missingSecrets = secretsToUpdate.filter((el) => !existingKeys.has(el.secretKey));

      if (missingSecrets.length) {
        if (updateMode === SecretUpdateMode.FailOnNotFound) {
          throw new NotFoundError({
            message: `Secret does not exist: ${missingSecrets.map((el) => el.secretKey).join(", ")}`
          });
        }

        if (updateMode === SecretUpdateMode.Upsert) {
          const createdKeys = new Set(commits.filter((c) => c.op === SecretOperations.Create).map((c) => c.key));

          // Make sure we don't create 2 Create operations for the same key
          const upsertSecrets = [
            ...new Map(
              missingSecrets.filter((s) => !createdKeys.has(s.secretKey)).map((s) => [s.secretKey, s] as const)
            ).values()
          ];

          secretsToValidate.push(...upsertSecrets.map((s) => ({ key: s.secretKey, value: s.secretValue })));

          commits.push(
            ...upsertSecrets.map((secret) => ({
              op: SecretOperations.Create as const,
              version: 1,
              encryptedComment: setKnexStringValue(
                secret.secretComment,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
              ),
              encryptedValue: setKnexStringValue(
                secret.secretValue,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
              ),
              skipMultilineEncoding: secret.skipMultilineEncoding,
              key: secret.secretKey,
              secretMetadata: JSON.stringify(
                (secret.secretMetadata || [])?.map((meta) => ({
                  key: meta.key,
                  [meta.isEncrypted ? "encryptedValue" : "value"]: meta.isEncrypted
                    ? secretManagerEncryptor({ plainText: Buffer.from(meta.value) }).cipherTextBlob.toString("base64")
                    : meta.value
                }))
              ),
              type: SecretType.Shared
            }))
          );
          upsertSecrets.forEach(({ tagIds, secretKey }) => {
            if (tagIds?.length) commitTagIds[secretKey] = tagIds;
          });
        }
      }

      const actualSecretsToUpdate = secretsToUpdate.filter((el) => existingKeys.has(el.secretKey));

      const secretsWithNewName = actualSecretsToUpdate.filter(
        ({ newSecretName, secretKey }) => Boolean(newSecretName) && newSecretName !== secretKey
      );
      if (secretsWithNewName.length) {
        const secrets = await secretV2BridgeDAL.findBySecretKeys(
          folderId,
          secretsWithNewName.map((el) => ({
            key: el.secretKey,
            type: SecretType.Shared
          })),
          providedTx
        );

        if (secrets.length !== secretsWithNewName.length)
          throw new NotFoundError({
            message: `Secret does not exist: ${diff(
              secretsWithNewName.map((el) => el.secretKey),
              secrets.map((el) => el.key)
            ).join(", ")}`
          });

        // the new name must not already be taken by another secret in the folder
        const existingSecretsWithNewName = await secretV2BridgeDAL.findBySecretKeys(
          folderId,
          secretsWithNewName.map((el) => ({
            key: el.newSecretName as string,
            type: SecretType.Shared
          })),
          providedTx
        );
        if (existingSecretsWithNewName.length)
          throw new BadRequestError({
            message: `Secret with the new name already exists: ${existingSecretsWithNewName
              .map((el) => el.key)
              .join(", ")}`
          });
      }

      const updatingSecretsGroupByKey = groupBy(secretsToUpdateStoredInDB, (el) => el.key);

      secretsToValidate.push(
        ...actualSecretsToUpdate
          .filter((s) => s.secretValue !== undefined || s.newSecretName)
          .map((s) => ({
            key: s.newSecretName || s.secretKey,
            value: s.secretValue,
            secretId: updatingSecretsGroupByKey[s.secretKey]?.[0]?.id
          }))
      );

      const latestSecretVersions = await secretVersionV2BridgeDAL.findLatestVersionMany(
        folderId,
        secretsToUpdateStoredInDB.map(({ id }) => id),
        providedTx
      );
      commits.push(
        ...actualSecretsToUpdate.map(
          ({
            newSecretName,
            secretKey,
            tagIds,
            secretValue,
            reminderRepeatDays,
            reminderNote,
            secretComment,
            skipMultilineEncoding,
            secretMetadata
          }) => {
            const secretId = updatingSecretsGroupByKey[secretKey][0].id;
            if (tagIds?.length || existingTagIds[secretKey]?.length) {
              commitTagIds[newSecretName ?? secretKey] = tagIds || existingTagIds[secretKey];
            }

            const { metadata, ...el } = latestSecretVersions[secretId];
            return {
              ...el,
              secretMetadata: JSON.stringify(
                (secretMetadata || [])?.map((meta) => ({
                  key: meta.key,
                  [meta.isEncrypted ? "encryptedValue" : "value"]: meta.isEncrypted
                    ? secretManagerEncryptor({ plainText: Buffer.from(meta.value) }).cipherTextBlob.toString("base64")
                    : meta.value
                }))
              ),
              key: newSecretName || secretKey,
              encryptedComment: setKnexStringValue(
                secretComment,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob,
                true // scott: we need to encrypt empty string on update to differentiate not updating comment vs clearing comment
              ),
              encryptedValue: setKnexStringValue(
                secretValue,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob,
                true // scott: we need to encrypt empty string on update to differentiate not updating value vs clearing value
              ),
              reminderRepeatDays,
              reminderNote,
              skipMultilineEncoding,
              op: SecretOperations.Update as const,
              secret: secretId,
              secretVersion: latestSecretVersions[secretId].id,
              version: updatingSecretsGroupByKey[secretKey][0].version || 1
            };
          }
        )
      );
    }
    // deleted secrets
    const deletedSecrets = data[SecretOperations.Delete];
    if (deletedSecrets && deletedSecrets.length) {
      const secretsToDeleteInDB = await secretV2BridgeDAL.find(
        {
          folderId,
          $complex: {
            operator: "and",
            value: [
              {
                operator: "or",
                value: deletedSecrets.map((el) => ({
                  operator: "and",
                  value: [
                    {
                      operator: "eq",
                      field: `${TableName.SecretV2}.key` as "key",
                      value: el.secretKey
                    },
                    {
                      operator: "eq",
                      field: "type",
                      value: SecretType.Shared
                    }
                  ]
                }))
              }
            ]
          }
        },
        { tx: providedTx }
      );
      if (secretsToDeleteInDB.length !== deletedSecrets.length)
        throw new NotFoundError({
          message: `Secret does not exist: ${secretsToDeleteInDB.map((el) => el.key).join(",")}`
        });
      secretsToDeleteInDB.forEach((el) => {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionSecretActions.Delete,
          subject(ProjectPermissionSub.Secrets, {
            environment,
            secretPath,
            secretName: el.key,
            secretTags: el.tags?.map((i) => i.slug)
          })
        );
      });

      const secretsGroupedByKey = groupBy(secretsToDeleteInDB, (i) => i.key);
      const deletedSecretIds = deletedSecrets.map((el) => secretsGroupedByKey[el.secretKey][0].id);
      const latestSecretVersions = await secretVersionV2BridgeDAL.findLatestVersionMany(
        folderId,
        deletedSecretIds,
        providedTx
      );
      commits.push(
        ...deletedSecrets.map(({ secretKey }) => {
          const secret = secretsGroupedByKey[secretKey][0];
          const secretId = secret.id;
          const { metadata, ...el } = latestSecretVersions[secretId];
          return {
            op: SecretOperations.Delete as const,
            ...el,
            secretMetadata: JSON.stringify(
              (secret.secretMetadata || []).map((meta) => ({
                key: meta.key,
                value: meta.value || undefined,
                encryptedValue: meta.encryptedValue?.toString("base64") || undefined
              }))
            ),
            key: secretKey,
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id
          };
        })
      );
    }

    if (!commits.length) throw new BadRequestError({ message: "Empty commits" });

    if (secretsToValidate.length) {
      await $validateSecrets(
        {
          projectId,
          environment,
          envId: folder.envId,
          secretPath,
          secrets: secretsToValidate
        },
        permission,
        providedTx
      );
    }

    const tagIds = unique(Object.values(commitTagIds).flat());
    const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds, providedTx) : [];
    if (tagIds.length !== tags.length) throw new NotFoundError({ message: "Tag not found" });
    const tagsGroupById = groupBy(tags, (i) => i.id);

    commits.forEach((commit) => {
      let action = ProjectPermissionSecretActions.Create;
      if (commit.op === SecretOperations.Update) action = ProjectPermissionSecretActions.Edit;
      if (commit.op === SecretOperations.Delete) return; // we do the validation on top

      ForbiddenError.from(permission).throwUnlessCan(
        action,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: commit.key,
          secretTags: commitTagIds?.[commit.key]?.map((secretTagId) => tagsGroupById[secretTagId][0].slug)
        })
      );
    });

    return {
      folder,
      folderId,
      project,
      permission,
      commits,
      commitTagIds,
      tagIds,
      secretKeys: [...new Set(Object.values(data).flatMap((arr) => arr?.map((item) => item.secretKey) ?? []))]
    };
  };

  return { buildSecretApprovalCommits, validateSecrets: $validateSecrets };
};
