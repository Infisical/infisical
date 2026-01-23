import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import {
  SecretApprovalRequestsSecretsSchema,
  TSecretApprovalRequestsSecrets
} from "@app/db/schemas/secret-approval-requests-secrets";
import { SecretApprovalRequestsSecretsV2Schema } from "@app/db/schemas/secret-approval-requests-secrets-v2";
import { TSecretTags } from "@app/db/schemas/secret-tags";
import { DatabaseError, NotFoundError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TSecretApprovalRequestSecretDALFactory = ReturnType<typeof secretApprovalRequestSecretDALFactory>;

export const secretApprovalRequestSecretDALFactory = (db: TDbClient) => {
  const secretApprovalRequestSecretOrm = ormify(db, TableName.SecretApprovalRequestSecret);
  const secretApprovalRequestSecretTagOrm = ormify(db, TableName.SecretApprovalRequestSecretTag);
  const secretApprovalRequestSecretV2TagOrm = ormify(db, TableName.SecretApprovalRequestSecretTagV2);
  const secretApprovalRequestSecretV2Orm = ormify(db, TableName.SecretApprovalRequestSecretV2);

  const bulkUpdateNoVersionIncrement = async (data: TSecretApprovalRequestsSecrets[], tx?: Knex) => {
    try {
      const existingApprovalSecrets = await secretApprovalRequestSecretOrm.find(
        {
          $in: {
            id: data.map((el) => el.id)
          }
        },
        { tx }
      );

      if (existingApprovalSecrets.length !== data.length) {
        throw new NotFoundError({ message: "Some of the secret approvals do not exist" });
      }

      if (data.length === 0) return [];

      const updatedApprovalSecrets = await (tx || db)(TableName.SecretApprovalRequestSecret)
        .insert(data)
        .onConflict("id") // this will cause a conflict then merge the data
        .merge() // Merge the data with the existing data
        .returning("*");

      return updatedApprovalSecrets;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const findByRequestId = async (requestId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())({
        secVerTag: TableName.SecretTag
      })
        .from(TableName.SecretApprovalRequestSecret)
        .where({ requestId })
        .leftJoin(
          TableName.SecretApprovalRequestSecretTag,
          `${TableName.SecretApprovalRequestSecret}.id`,
          `${TableName.SecretApprovalRequestSecretTag}.secretId`
        )
        .leftJoin(TableName.SecretTag, `${TableName.SecretApprovalRequestSecretTag}.tagId`, `${TableName.SecretTag}.id`)
        .leftJoin(TableName.Secret, `${TableName.SecretApprovalRequestSecret}.secretId`, `${TableName.Secret}.id`)
        .leftJoin(
          TableName.SecretVersion,
          `${TableName.SecretVersion}.id`,
          `${TableName.SecretApprovalRequestSecret}.secretVersion`
        )
        .leftJoin(
          TableName.SecretVersionTag,
          `${TableName.SecretVersionTag}.${TableName.SecretVersion}Id`,
          `${TableName.SecretVersion}.id`
        )
        .leftJoin<TSecretTags>(
          db.ref(TableName.SecretTag).as("secVerTag"),
          `${TableName.SecretVersionTag}.${TableName.SecretTag}Id`,
          db.ref("id").withSchema("secVerTag")
        )
        .select(selectAllTableCols(TableName.SecretApprovalRequestSecret))
        .select({
          secVerTagId: "secVerTag.id",
          secVerTagColor: "secVerTag.color",
          secVerTagSlug: "secVerTag.slug"
        })
        .select(
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecretTag).as("tagJnId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
        )
        .select(
          db.ref("secretBlindIndex").withSchema(TableName.Secret).as("orgSecBlindIndex"),
          db.ref("version").withSchema(TableName.Secret).as("orgSecVersion"),
          db.ref("secretKeyIV").withSchema(TableName.Secret).as("orgSecKeyIV"),
          db.ref("secretKeyTag").withSchema(TableName.Secret).as("orgSecKeyTag"),
          db.ref("secretKeyCiphertext").withSchema(TableName.Secret).as("orgSecKeyCiphertext"),
          db.ref("secretValueIV").withSchema(TableName.Secret).as("orgSecValueIV"),
          db.ref("secretValueTag").withSchema(TableName.Secret).as("orgSecValueTag"),
          db.ref("secretValueCiphertext").withSchema(TableName.Secret).as("orgSecValueCiphertext"),
          db.ref("secretCommentIV").withSchema(TableName.Secret).as("orgSecCommentIV"),
          db.ref("secretCommentTag").withSchema(TableName.Secret).as("orgSecCommentTag"),
          db.ref("secretCommentCiphertext").withSchema(TableName.Secret).as("orgSecCommentCiphertext")
        )
        .select(
          db.ref("version").withSchema(TableName.SecretVersion).as("secVerVersion"),
          db.ref("secretKeyIV").withSchema(TableName.SecretVersion).as("secVerKeyIV"),
          db.ref("secretKeyTag").withSchema(TableName.SecretVersion).as("secVerKeyTag"),
          db.ref("secretKeyCiphertext").withSchema(TableName.SecretVersion).as("secVerKeyCiphertext"),
          db.ref("secretValueIV").withSchema(TableName.SecretVersion).as("secVerValueIV"),
          db.ref("secretValueTag").withSchema(TableName.SecretVersion).as("secVerValueTag"),
          db.ref("secretValueCiphertext").withSchema(TableName.SecretVersion).as("secVerValueCiphertext"),
          db.ref("secretCommentIV").withSchema(TableName.SecretVersion).as("secVerCommentIV"),
          db.ref("secretCommentTag").withSchema(TableName.SecretVersion).as("secVerCommentTag"),
          db.ref("secretCommentCiphertext").withSchema(TableName.SecretVersion).as("secVerCommentCiphertext")
        );
      const formatedDoc = sqlNestRelationships({
        data: doc,
        key: "id",
        parentMapper: (data) => SecretApprovalRequestsSecretsSchema.omit({ secretVersion: true }).parse(data),
        childrenMapper: [
          {
            key: "tagJnId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagSlug: slug, tagColor: color }) => ({
              id,
              name: slug,
              slug,
              color
            })
          },
          {
            key: "secretId",
            label: "secret" as const,
            mapper: ({
              orgSecKeyIV,
              orgSecKeyTag,
              orgSecValueIV,
              orgSecVersion,
              orgSecValueTag,
              orgSecCommentIV,
              orgSecBlindIndex,
              orgSecCommentTag,
              orgSecKeyCiphertext,
              orgSecValueCiphertext,
              orgSecCommentCiphertext,
              secretId
            }) =>
              secretId
                ? {
                    id: secretId,
                    version: orgSecVersion,
                    secretBlindIndex: orgSecBlindIndex,
                    secretKeyIV: orgSecKeyIV,
                    secretKeyTag: orgSecKeyTag,
                    secretKeyCiphertext: orgSecKeyCiphertext,
                    secretValueIV: orgSecValueIV,
                    secretValueTag: orgSecValueTag,
                    secretValueCiphertext: orgSecValueCiphertext,
                    secretCommentIV: orgSecCommentIV,
                    secretCommentTag: orgSecCommentTag,
                    secretCommentCiphertext: orgSecCommentCiphertext
                  }
                : undefined
          },
          {
            key: "secretVersion",
            label: "secretVersion" as const,
            mapper: ({
              secVerCommentIV,
              secVerCommentCiphertext,
              secVerCommentTag,
              secVerValueCiphertext,
              secVerKeyIV,
              secVerKeyTag,
              secVerValueIV,
              secretVersion,
              secVerValueTag,
              secVerKeyCiphertext,
              secVerVersion
            }) =>
              secretVersion
                ? {
                    version: secVerVersion,
                    id: secretVersion,
                    secretKeyIV: secVerKeyIV,
                    secretKeyTag: secVerKeyTag,
                    secretKeyCiphertext: secVerKeyCiphertext,
                    secretValueIV: secVerValueIV,
                    secretValueTag: secVerValueTag,
                    secretValueCiphertext: secVerValueCiphertext,
                    secretCommentIV: secVerCommentIV,
                    secretCommentTag: secVerCommentTag,
                    secretCommentCiphertext: secVerCommentCiphertext
                  }
                : undefined,
            childrenMapper: [
              {
                key: "secVerTagId",
                label: "tags" as const,
                mapper: ({ secVerTagId: id, secVerTagSlug: slug, secVerTagColor: color }) => ({
                  // eslint-disable-next-line
                  id,
                  // eslint-disable-next-line
                  name: slug,
                  // eslint-disable-next-line
                  slug,
                  // eslint-disable-next-line
                  color
                })
              }
            ]
          }
        ]
      });
      return formatedDoc?.map(({ secret, secretVersion, ...el }) => ({
        ...el,
        secret: secret?.[0],
        secretVersion: secretVersion?.[0]
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByRequestId" });
    }
  };

  const findByRequestIdBridgeSecretV2 = async (requestId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())({
        secVerTag: TableName.SecretTag
      })
        .from(TableName.SecretApprovalRequestSecretV2)
        .where({ requestId })
        .leftJoin(
          TableName.SecretApprovalRequestSecretTagV2,
          `${TableName.SecretApprovalRequestSecretV2}.id`,
          `${TableName.SecretApprovalRequestSecretTagV2}.secretId`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretApprovalRequestSecretTagV2}.tagId`,
          `${TableName.SecretTag}.id`
        )
        .leftJoin(TableName.SecretV2, `${TableName.SecretApprovalRequestSecretV2}.secretId`, `${TableName.SecretV2}.id`)
        .leftJoin(
          TableName.SecretVersionV2,
          `${TableName.SecretVersionV2}.id`,
          `${TableName.SecretApprovalRequestSecretV2}.secretVersion`
        )
        .leftJoin(
          TableName.SecretVersionV2Tag,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin<TSecretTags>(
          db.ref(TableName.SecretTag).as("secVerTag"),
          `${TableName.SecretVersionV2Tag}.${TableName.SecretTag}Id`,
          db.ref("id").withSchema("secVerTag")
        )
        .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )
        .select(selectAllTableCols(TableName.SecretApprovalRequestSecretV2))
        .select({
          secVerTagId: "secVerTag.id",
          secVerTagColor: "secVerTag.color",
          secVerTagSlug: "secVerTag.slug"
        })
        .select(
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecretTagV2).as("tagJnId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
        )
        .select(
          db.ref("version").withSchema(TableName.SecretV2).as("orgSecVersion"),
          db.ref("key").withSchema(TableName.SecretV2).as("orgSecKey"),
          db.ref("encryptedValue").withSchema(TableName.SecretV2).as("orgSecValue"),
          db.ref("encryptedComment").withSchema(TableName.SecretV2).as("orgSecComment")
        )
        .select(
          db.ref("version").withSchema(TableName.SecretVersionV2).as("secVerVersion"),
          db.ref("key").withSchema(TableName.SecretVersionV2).as("secVerKey"),
          db.ref("encryptedValue").withSchema(TableName.SecretVersionV2).as("secVerValue"),
          db.ref("encryptedComment").withSchema(TableName.SecretVersionV2).as("secVerComment"),
          db.ref("skipMultilineEncoding").withSchema(TableName.SecretVersionV2).as("secVerSkipMultilineEncoding")
        )
        .select(
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
          db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue")
        )
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping));
      const formatedDoc = sqlNestRelationships({
        data: doc,
        key: "id",
        parentMapper: (data) => SecretApprovalRequestsSecretsV2Schema.omit({ secretVersion: true }).parse(data),
        childrenMapper: [
          {
            key: "tagJnId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagSlug: slug, tagColor: color }) => ({
              id,
              name: slug,
              slug,
              color
            })
          },
          {
            key: "secretId",
            label: "secret" as const,
            mapper: ({ orgSecVersion, orgSecKey, orgSecValue, orgSecComment, secretId, rotationId }) =>
              secretId
                ? {
                    id: secretId,
                    version: orgSecVersion,
                    key: orgSecKey,
                    encryptedValue: orgSecValue,
                    encryptedComment: orgSecComment,
                    isRotatedSecret: Boolean(rotationId),
                    rotationId
                  }
                : undefined
          },
          {
            key: "secretVersion",
            label: "secretVersion" as const,
            mapper: ({
              secretVersion,
              secVerVersion,
              secVerKey,
              secVerValue,
              secVerComment,
              secVerSkipMultilineEncoding
            }) =>
              secretVersion
                ? {
                    version: secVerVersion,
                    id: secretVersion,
                    key: secVerKey,
                    encryptedValue: secVerValue,
                    encryptedComment: secVerComment,
                    skipMultilineEncoding: secVerSkipMultilineEncoding
                  }
                : undefined,
            childrenMapper: [
              {
                key: "secVerTagId",
                label: "tags" as const,
                mapper: ({ secVerTagId: id, secVerTagSlug: slug, secVerTagColor: color }) => ({
                  // eslint-disable-next-line
                  id,
                  // eslint-disable-next-line
                  name: slug,
                  // eslint-disable-next-line
                  slug,
                  // eslint-disable-next-line
                  color
                })
              }
            ]
          },
          {
            key: "metadataId",
            label: "oldSecretMetadata" as const,
            mapper: ({ metadataKey, metadataEncryptedValue, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue,
              encryptedValue: metadataEncryptedValue
            })
          }
        ]
      });

      return formatedDoc?.map(({ secret, secretVersion, ...el }) => ({
        ...el,
        secret: secret?.[0],
        secretVersion: secretVersion?.[0]
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByRequestId" });
    }
  };
  // special query for migration to v2 secret
  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretApprovalRequestSecret)
        .join(
          TableName.SecretApprovalRequest,
          `${TableName.SecretApprovalRequest}.id`,
          `${TableName.SecretApprovalRequestSecret}.requestId`
        )
        .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .leftJoin(
          TableName.SecretApprovalRequestSecretTag,
          `${TableName.SecretApprovalRequestSecret}.id`,
          `${TableName.SecretApprovalRequestSecretTag}.secretId`
        )
        .where({ projectId })
        .select(selectAllTableCols(TableName.SecretApprovalRequestSecret))
        .select(
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecretTag).as("secretApprovalTagId"),
          db.ref("secretId").withSchema(TableName.SecretApprovalRequestSecretTag).as("secretApprovalTagSecretId"),
          db.ref("tagId").withSchema(TableName.SecretApprovalRequestSecretTag).as("secretApprovalTagSecretTagId"),
          db.ref("createdAt").withSchema(TableName.SecretApprovalRequestSecretTag).as("secretApprovalTagCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.SecretApprovalRequestSecretTag).as("secretApprovalTagUpdatedAt")
        );
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => SecretApprovalRequestsSecretsSchema.parse(data),
        childrenMapper: [
          {
            key: "secretApprovalTagId",
            label: "tags" as const,
            mapper: ({
              secretApprovalTagSecretId,
              secretApprovalTagId,
              secretApprovalTagUpdatedAt,
              secretApprovalTagCreatedAt
            }) => ({
              secretApprovalTagSecretId,
              secretApprovalTagId,
              secretApprovalTagUpdatedAt,
              secretApprovalTagCreatedAt
            })
          }
        ]
      });
      return formatedDoc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByRequestId" });
    }
  };

  return {
    ...secretApprovalRequestSecretOrm,
    insertV2Bridge: secretApprovalRequestSecretV2Orm.insertMany,
    findByRequestId,
    findByRequestIdBridgeSecretV2,
    bulkUpdateNoVersionIncrement,
    findByProjectId,
    insertApprovalSecretTags: secretApprovalRequestSecretTagOrm.insertMany,
    insertApprovalSecretV2Tags: secretApprovalRequestSecretV2TagOrm.insertMany
  };
};
