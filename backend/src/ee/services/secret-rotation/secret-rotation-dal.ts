import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { SecretRotationsSchema, TSecretRotations } from "@app/db/schemas/secret-rotations";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

export type TSecretRotationDALFactory = ReturnType<typeof secretRotationDALFactory>;

export const secretRotationDALFactory = (db: TDbClient) => {
  const secretRotationOrm = ormify(db, TableName.SecretRotation);
  const secretRotationOutputOrm = ormify(db, TableName.SecretRotationOutput);
  const secretRotationOutputV2Orm = ormify(db, TableName.SecretRotationOutputV2);

  const findQuery = (filter: TFindFilter<TSecretRotations & { projectId: string }>, tx: Knex) =>
    tx(TableName.SecretRotation)
      .where(filter)
      .join(TableName.Environment, `${TableName.SecretRotation}.envId`, `${TableName.Environment}.id`)
      .leftJoin(
        TableName.SecretRotationOutput,
        `${TableName.SecretRotation}.id`,
        `${TableName.SecretRotationOutput}.rotationId`
      )
      .join(TableName.Secret, `${TableName.SecretRotationOutput}.secretId`, `${TableName.Secret}.id`)
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
      .select(tx.ref("secretKeyCiphertext").withSchema(TableName.Secret));

  const find = async (filter: TFindFilter<TSecretRotations & { projectId: string }>, tx?: Knex) => {
    try {
      const data = await findQuery(filter, tx || db.replicaNode());
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
            mapper: ({ secId, outputKey, secVersion, secretKeyIV, secretKeyTag, secretKeyCiphertext }) => ({
              key: outputKey,
              secret: {
                id: secId,
                version: secVersion,
                secretKeyIV,
                secretKeyTag,
                secretKeyCiphertext
              }
            })
          }
        ]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretRotationFind" });
    }
  };

  const findQuerySecretV2 = (filter: TFindFilter<TSecretRotations & { projectId: string }>, tx: Knex) =>
    tx(TableName.SecretRotation)
      .where(filter)
      .join(TableName.Environment, `${TableName.SecretRotation}.envId`, `${TableName.Environment}.id`)
      .leftJoin(
        TableName.SecretRotationOutputV2,
        `${TableName.SecretRotation}.id`,
        `${TableName.SecretRotationOutputV2}.rotationId`
      )
      .join(TableName.SecretV2, `${TableName.SecretRotationOutputV2}.secretId`, `${TableName.SecretV2}.id`)
      .select(selectAllTableCols(TableName.SecretRotation))
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(tx.ref("key").withSchema(TableName.SecretRotationOutputV2).as("outputKey"))
      .select(tx.ref("id").withSchema(TableName.SecretV2).as("secId"))
      .select(tx.ref("version").withSchema(TableName.SecretV2).as("secVersion"))
      .select(tx.ref("key").withSchema(TableName.SecretV2).as("secretKey"));

  const findSecretV2 = async (filter: TFindFilter<TSecretRotations & { projectId: string }>, tx?: Knex) => {
    try {
      const data = await findQuerySecretV2(filter, tx || db.replicaNode());
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
            mapper: ({ secId, outputKey, secVersion, secretKey }) => ({
              key: outputKey,
              secret: {
                id: secId,
                version: secVersion,
                secretKey
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
      const doc = await (tx || db.replicaNode())(TableName.SecretRotation)
        .join(TableName.Environment, `${TableName.SecretRotation}.envId`, `${TableName.Environment}.id`)
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

  const findRotationOutputsByRotationId = async (rotationId: string) => secretRotationOutputOrm.find({ rotationId });
  const findRotationOutputsV2ByRotationId = async (rotationId: string) =>
    secretRotationOutputV2Orm.find({ rotationId });

  // special query

  return {
    ...secretRotationOrm,
    find,
    findSecretV2,
    findById,
    secretOutputInsertMany: secretRotationOutputOrm.insertMany,
    secretOutputV2InsertMany: secretRotationOutputV2Orm.insertMany,
    findRotationOutputsByRotationId,
    findRotationOutputsV2ByRotationId
  };
};
