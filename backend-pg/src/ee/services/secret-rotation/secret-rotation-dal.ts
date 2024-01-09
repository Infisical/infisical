import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { SecretRotationsSchema, TableName, TSecretRotations } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

export type TSecretRotationDalFactory = ReturnType<typeof secretRotationDalFactory>;

export const secretRotationDalFactory = (db: TDbClient) => {
  const secretRotationOrm = ormify(db, TableName.SecretRotation);
  const secretRotationOutputOrm = ormify(db, TableName.SecretRotationOutput);

  const findQuery = (filter: TFindFilter<TSecretRotations & { projectId: string }>, tx: Knex) =>
    tx(TableName.SecretRotation)
      .where(filter)
      .join(
        TableName.Environment,
        `${TableName.SecretRotation}.envId`,
        `${TableName.Environment}.id`
      )
      .leftJoin(
        TableName.SecretRotationOutput,
        `${TableName.SecretRotation}.id`,
        `${TableName.SecretRotationOutput}.rotationId`
      )
      .join(
        TableName.Secret,
        `${TableName.SecretRotationOutput}.secretId`,
        `${TableName.Secret}.id`
      )
      .select(selectAllTableCols(TableName.SecretRotation))
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(tx.ref("key").withSchema(TableName.SecretRotationOutput).as("outputKey"))
      .select(tx.ref("id").withSchema(TableName.Secret).as("secId"))
      .select(tx.ref("version").withSchema(TableName.Secret).as("secVersion"))
      .select(tx.ref("secretKeyIV").withSchema(TableName.Secret))
      .select(tx.ref("secretKeyTag").withSchema(TableName.Secret))
      .select(tx.ref("secretKeyCiphertext").withSchema(TableName.Secret))
      .select(tx.ref("secretValueIV").withSchema(TableName.Secret))
      .select(tx.ref("secretValueTag").withSchema(TableName.Secret))
      .select(tx.ref("secretValueCiphertext").withSchema(TableName.Secret))
      .select(tx.ref("secretCommentIV").withSchema(TableName.Secret))
      .select(tx.ref("secretCommentTag").withSchema(TableName.Secret))
      .select(tx.ref("secretCommentCiphertext").withSchema(TableName.Secret));

  const find = async (filter: TFindFilter<TSecretRotations & { projectId: string }>, tx?: Knex) => {
    try {
      const data = await findQuery(filter, tx || db);
      return sqlNestRelationships({
        data,
        key: "id",
        parentMapper: (el) => ({
          ...SecretRotationsSchema.parse(el),
          projectId: el.projectId,
          environment: { id: el.envId, name: el.envName, slug: el.envSlug }
        }),
        childrenMapper: [
          {
            key: "secId",
            label: "outputs" as const,
            mapper: ({
              secId,
              outputKey,
              secVersion,
              secretKeyIV,
              secretKeyTag,
              secretKeyCiphertext,
              secretValueTag,
              secretValueIV,
              secretValueCiphertext,
              secretCommentIV,
              secretCommentTag,
              secretCommentCiphertext
            }) => ({
              key: outputKey,
              secret: {
                id: secId,
                version: secVersion,
                secretKeyIV,
                secretKeyTag,
                secretKeyCiphertext,
                secretValueTag,
                secretValueIV,
                secretValueCiphertext,
                secretCommentIV,
                secretCommentTag,
                secretCommentCiphertext
              }
            })
          }
        ]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretRotationFind" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.SecretRotation)
        .join(
          TableName.Environment,
          `${TableName.SecretRotation}.envId`,
          `${TableName.Environment}.id`
        )
        .where({ [`${TableName.SecretRotation}.id` as "id"]: id })
        .select(selectAllTableCols(TableName.SecretRotation))
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .first();
      if (doc) {
        const { envName, envSlug, envId, ...el } = doc;
        return { ...el, envId, environment: { id: envId, slug: envSlug, name: envName } };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretRotationFindById" });
    }
  };

  const findRotationOutputsByRotationId = async (rotationId: string) =>
    secretRotationOutputOrm.find({ rotationId });

  return {
    ...secretRotationOrm,
    find,
    findById,
    secretOutputInsertMany: secretRotationOutputOrm.insertMany,
    findRotationOutputsByRotationId
  };
};
