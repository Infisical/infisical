import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  SecretApprovalRequestsSecretsSchema,
  TableName,
  TSecretApprovalRequestsSecrets,
  TSecretApprovalRequestsSecretsUpdate,
  TSecretTags
} from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TSecretApprovalRequestSecretDALFactory = ReturnType<typeof secretApprovalRequestSecretDALFactory>;

export const secretApprovalRequestSecretDALFactory = (db: TDbClient) => {
  const secretApprovalRequestSecretOrm = ormify(db, TableName.SecretApprovalRequestSecret);
  const secretApprovalRequestSecretTagOrm = ormify(db, TableName.SecretApprovalRequestSecretTag);

  const bulkUpdateNoVersionIncrement = async (
    data: Array<{ filter: Partial<TSecretApprovalRequestsSecrets>; data: TSecretApprovalRequestsSecretsUpdate }>,
    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.SecretApprovalRequestSecret)
            .where(filter)
            .update(updateData)
            .returning("*");
          if (!doc) throw new BadRequestError({ message: "Failed to update document" });
          return doc;
        })
      );
      return secs;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const findByRequestId = async (requestId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)({
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
          secVerTagSlug: "secVerTag.slug",
          secVerTagName: "secVerTag.name"
        })
        .select(
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecretTag).as("tagJnId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"),
          db.ref("name").withSchema(TableName.SecretTag).as("tagName")
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
            mapper: ({ tagId: id, tagName: name, tagSlug: slug, tagColor: color }) => ({
              id,
              name,
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
                mapper: ({ secVerTagId: id, secVerTagName: name, secVerTagSlug: slug, secVerTagColor: color }) => ({
                  // eslint-disable-next-line
                  id,
                  // eslint-disable-next-line
                  name,
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
  return {
    ...secretApprovalRequestSecretOrm,
    findByRequestId,
    bulkUpdateNoVersionIncrement,
    insertApprovalSecretTags: secretApprovalRequestSecretTagOrm.insertMany
  };
};
