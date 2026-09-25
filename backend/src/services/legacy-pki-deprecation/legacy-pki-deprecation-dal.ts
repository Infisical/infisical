import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TLegacyPkiDeprecationDALFactory = ReturnType<typeof legacyPkiDeprecationDALFactory>;

/**
 * Backs the monthly deprecation notice. Queries the resource tables, never the unindexed FK columns on
 * certificates. Templates have no projectId, so they are scoped through their issuing CA.
 */
export const legacyPkiDeprecationDALFactory = (db: TDbClient) => {
  const subscriberProjectQuery = (conn: Knex) =>
    conn(TableName.PkiSubscriber)
      .join(TableName.Project, `${TableName.PkiSubscriber}.projectId`, `${TableName.Project}.id`)
      .whereNull(`${TableName.Project}.deleteAfter`);

  const templateProjectQuery = (conn: Knex) =>
    conn(TableName.CertificateTemplate)
      .join(
        TableName.CertificateAuthority,
        `${TableName.CertificateTemplate}.caId`,
        `${TableName.CertificateAuthority}.id`
      )
      .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
      .whereNull(`${TableName.Project}.deleteAfter`);

  const findOrgIdsWithLegacyPkiResources = async (tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const [subscriberOrgIds, templateOrgIds] = await Promise.all([
        subscriberProjectQuery(conn)
          .distinct(db.ref("orgId").withSchema(TableName.Project))
          .pluck<string[]>(`${TableName.Project}.orgId`),
        templateProjectQuery(conn)
          .distinct(db.ref("orgId").withSchema(TableName.Project))
          .pluck<string[]>(`${TableName.Project}.orgId`)
      ]);

      return [...new Set([...subscriberOrgIds, ...templateOrgIds])];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOrgIdsWithLegacyPkiResources" });
    }
  };

  /** Both empty means the org cleaned up after the notice was enqueued. Split by resource so the
   * notice can link at the page that actually holds something. */
  const findLegacyPkiProjectIdsByOrgId = async (orgId: string, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const [subscriberProjectIds, templateProjectIds] = await Promise.all([
        subscriberProjectQuery(conn)
          .where(`${TableName.Project}.orgId`, orgId)
          .distinct(db.ref("id").withSchema(TableName.Project))
          .pluck<string[]>(`${TableName.Project}.id`),
        templateProjectQuery(conn)
          .where(`${TableName.Project}.orgId`, orgId)
          .distinct(db.ref("id").withSchema(TableName.Project))
          .pluck<string[]>(`${TableName.Project}.id`)
      ]);

      return { subscriberProjectIds, templateProjectIds };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLegacyPkiProjectIdsByOrgId" });
    }
  };

  return {
    findOrgIdsWithLegacyPkiResources,
    findLegacyPkiProjectIdsByOrgId
  };
};
