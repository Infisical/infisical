import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { HoneyTokenStatus } from "./honey-token-enums";

export type THoneyTokenDALFactory = ReturnType<typeof honeyTokenDALFactory>;

export const honeyTokenDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.HoneyToken);

  const findByFolderIds = async (folderIds: string[], tx?: Knex) => {
    const rows = await (tx || db.replicaNode())(TableName.HoneyToken)
      .whereIn(`${TableName.HoneyToken}.folderId`, folderIds)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.HoneyToken}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .select(
        db.ref("id").withSchema(TableName.HoneyToken),
        db.ref("name").withSchema(TableName.HoneyToken),
        db.ref("description").withSchema(TableName.HoneyToken),
        db.ref("type").withSchema(TableName.HoneyToken),
        db.ref("hosting").withSchema(TableName.HoneyToken),
        db.ref("status").withSchema(TableName.HoneyToken),
        db.ref("secretsMapping").withSchema(TableName.HoneyToken),
        db.ref("createdAt").withSchema(TableName.HoneyToken),
        db.ref("updatedAt").withSchema(TableName.HoneyToken)
      )
      .select(
        // the joined rows always exist here, unlike the nullable honey token columns
        db.ref("projectId").withSchema(TableName.Environment).as("projectId"),
        db.ref("id").withSchema(TableName.SecretFolder).as("folderId"),
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
      hosting: row.hosting,
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
      .whereNotNull(`${TableName.HoneyToken}.folderId`)
      .select(selectAllTableCols(TableName.HoneyToken))
      .first();

    return row ?? null;
  };

  const findOneByTokenIdentifier = async (tokenIdentifier: string, tx?: Knex) => {
    const row = await (tx || db.replicaNode())(TableName.HoneyToken)
      .join(TableName.Project, `${TableName.HoneyToken}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.HoneyToken}.tokenIdentifier`, tokenIdentifier)
      .whereNotNull(`${TableName.HoneyToken}.folderId`)
      .select(selectAllTableCols(TableName.HoneyToken), db.ref("orgId").withSchema(TableName.Project).as("orgId"))
      .first();

    return row ?? null;
  };

  const countByOrgId = async (orgId: string, tx?: Knex) => {
    const [result] = await (tx || db.replicaNode())(TableName.HoneyToken)
      .join(TableName.Project, `${TableName.HoneyToken}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.Project}.orgId`, orgId)
      .whereNot(`${TableName.HoneyToken}.status`, "revoked")
      .whereNotNull(`${TableName.HoneyToken}.folderId`)
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

  const countByProjectId = async (projectId: string, tx?: Knex) => {
    const [result] = await (tx || db.replicaNode())(TableName.HoneyToken)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.HoneyToken}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .where(`${TableName.HoneyToken}.projectId`, projectId)
      .whereNot(`${TableName.HoneyToken}.status`, "revoked")
      // exclude honey tokens in soft-deleted environments, mirroring findByFolderIds and the other counts
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .count<{ count: string | number }>({
        count: `${TableName.HoneyToken}.id`
      });

    return Number(result?.count ?? 0);
  };

  const $selectForCleanup = (knex: Knex) =>
    knex(TableName.HoneyToken)
      // left join: a row whose project was deleted before it was revoked still has to be found and reported
      .leftJoin(TableName.Project, `${TableName.HoneyToken}.projectId`, `${TableName.Project}.id`)
      .select(
        db.ref("id").withSchema(TableName.HoneyToken),
        db.ref("type").withSchema(TableName.HoneyToken),
        db.ref("status").withSchema(TableName.HoneyToken),
        db.ref("projectId").withSchema(TableName.HoneyToken),
        db.ref("encryptedCredentials").withSchema(TableName.HoneyToken),
        db.ref("orgId").withSchema(TableName.Project)
      );

  // Read before a project or org is deleted, so it uses the primary: a token a lagging replica has not seen yet
  // would be deleted without being revoked, with nothing left for a later pass to recover.
  const findUnrevokedByProjectIdForCleanup = async (projectId: string, tx?: Knex) =>
    $selectForCleanup(tx || db)
      .where(`${TableName.HoneyToken}.projectId`, projectId)
      .whereNot(`${TableName.HoneyToken}.status`, HoneyTokenStatus.Revoked);

  // covers sub-orgs at any depth, since deleting an org cascades through parentOrgId
  const findUnrevokedByOrgTreeForCleanup = async (orgId: string, tx?: Knex) =>
    $selectForCleanup(tx || db)
      .whereIn(
        `${TableName.Project}.orgId`,
        (tx || db)
          .withRecursive("org_tree", (qb) => {
            void qb
              .select("id")
              .from(TableName.Organization)
              .where("id", orgId)
              .union((uqb) => {
                void uqb
                  .select(`${TableName.Organization}.id`)
                  .from(TableName.Organization)
                  .join("org_tree", `${TableName.Organization}.parentOrgId`, "org_tree.id");
              });
          })
          .select("id")
          .from("org_tree")
      )
      .whereNot(`${TableName.HoneyToken}.status`, HoneyTokenStatus.Revoked);

  const findByIdForCleanup = async (id: string, tx?: Knex) =>
    $selectForCleanup(tx || db.replicaNode())
      .where(`${TableName.HoneyToken}.id`, id)
      .first();

  const findFolderlessForCleanup = async (limit: number, tx?: Knex) =>
    $selectForCleanup(tx || db.replicaNode())
      .whereNull(`${TableName.HoneyToken}.folderId`)
      .orderBy(`${TableName.HoneyToken}.updatedAt`, "asc")
      .limit(limit);

  return {
    ...orm,
    findByFolderIds,
    countByFolderIds,
    findOneByTokenIdentifierAndOrgId,
    findOneByTokenIdentifier,
    countByOrgId,
    countByProjectId,
    tryMarkTriggered,
    createSecretMappings,
    deleteSecretMappingsByHoneyTokenId,
    findUnrevokedByProjectIdForCleanup,
    findUnrevokedByOrgTreeForCleanup,
    findFolderlessForCleanup,
    findByIdForCleanup
  };
};
