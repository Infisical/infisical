import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type THoneyTokenDALFactory = ReturnType<typeof honeyTokenDALFactory>;

export const honeyTokenDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.HoneyToken);

  const findByFolderIds = async (folderIds: string[], tx?: Knex) => {
    const rows = await (tx || db.replicaNode())(TableName.HoneyToken)
      .whereIn(`${TableName.HoneyToken}.folderId`, folderIds)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.HoneyToken}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .select(
        db.ref("id").withSchema(TableName.HoneyToken),
        db.ref("name").withSchema(TableName.HoneyToken),
        db.ref("description").withSchema(TableName.HoneyToken),
        db.ref("type").withSchema(TableName.HoneyToken),
        db.ref("status").withSchema(TableName.HoneyToken),
        db.ref("projectId").withSchema(TableName.HoneyToken),
        db.ref("folderId").withSchema(TableName.HoneyToken),
        db.ref("secretsMapping").withSchema(TableName.HoneyToken),
        db.ref("createdAt").withSchema(TableName.HoneyToken),
        db.ref("updatedAt").withSchema(TableName.HoneyToken)
      )
      .select(
        db.ref("id").withSchema(TableName.Environment).as("envId"),
        db.ref("name").withSchema(TableName.Environment).as("envName"),
        db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
        db.ref("name").withSchema(TableName.SecretFolder).as("folderName")
      );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      status: row.status,
      projectId: row.projectId,
      folderId: row.folderId,
      secretsMapping: row.secretsMapping as Record<string, string>,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      environment: {
        id: row.envId,
        name: row.envName,
        slug: row.envSlug
      },
      folder: {
        path: row.folderName
      }
    }));
  };

  const countByFolderIds = async (folderIds: string[], search?: string, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.HoneyToken).whereIn(`${TableName.HoneyToken}.folderId`, folderIds);

    if (search) {
      void query.where(`${TableName.HoneyToken}.name`, "ilike", `%${search}%`);
    }

    const [result] = await query.countDistinct<{ count: string | number }>({
      count: `${TableName.HoneyToken}.name`
    });
    return Number(result?.count ?? 0);
  };

  const findOneByTokenIdentifierAndOrgId = async (tokenIdentifier: string, orgId: string, tx?: Knex) => {
    const row = await (tx || db.replicaNode())(TableName.HoneyToken)
      .join(TableName.Project, `${TableName.HoneyToken}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.HoneyToken}.tokenIdentifier`, tokenIdentifier)
      .andWhere(`${TableName.Project}.orgId`, orgId)
      .select(selectAllTableCols(TableName.HoneyToken))
      .first();

    return row ?? null;
  };

  const findOneByTokenIdentifier = async (tokenIdentifier: string, tx?: Knex) => {
    const row = await (tx || db.replicaNode())(TableName.HoneyToken)
      .join(TableName.Project, `${TableName.HoneyToken}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.HoneyToken}.tokenIdentifier`, tokenIdentifier)
      .select(selectAllTableCols(TableName.HoneyToken), db.ref("orgId").withSchema(TableName.Project).as("orgId"))
      .first();

    return row ?? null;
  };

  const countByOrgId = async (orgId: string, tx?: Knex) => {
    const [result] = await (tx || db.replicaNode())(TableName.HoneyToken)
      .join(TableName.Project, `${TableName.HoneyToken}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.Project}.orgId`, orgId)
      .whereNot(`${TableName.HoneyToken}.status`, "revoked")
      .count<{ count: string | number }>({
        count: `${TableName.HoneyToken}.id`
      });

    return Number(result?.count ?? 0);
  };

  const tryMarkTriggered = async (tokenIdentifier: string, cooldownMs: number, tx?: Knex) => {
    const now = new Date();
    const cooldownThreshold = new Date(now.getTime() - cooldownMs);

    const [row] = await (tx || db)(TableName.HoneyToken)
      .where({ tokenIdentifier })
      .andWhere("status", "!=", "revoked")
      .andWhere((qb) => {
        void qb.whereNull("lastTriggeredAt").orWhere("lastTriggeredAt", "<=", cooldownThreshold);
      })
      .update({
        status: "triggered",
        lastTriggeredAt: now
      })
      .returning("*");

    return row ?? null;
  };

  const createSecretMappings = async (honeyTokenId: string, secretIds: string[], tx?: Knex) => {
    if (!secretIds.length) return;

    await (tx || db)(TableName.HoneyTokenSecretMapping)
      .insert(
        secretIds.map((secretId) => ({
          honeyTokenId,
          secretId
        }))
      )
      .onConflict("secretId")
      .merge({ honeyTokenId });
  };

  const deleteSecretMappingsByHoneyTokenId = async (honeyTokenId: string, tx?: Knex) => {
    await (tx || db)(TableName.HoneyTokenSecretMapping).where({ honeyTokenId }).delete();
  };

  return {
    ...orm,
    findByFolderIds,
    countByFolderIds,
    findOneByTokenIdentifierAndOrgId,
    findOneByTokenIdentifier,
    countByOrgId,
    tryMarkTriggered,
    createSecretMappings,
    deleteSecretMappingsByHoneyTokenId
  };
};
