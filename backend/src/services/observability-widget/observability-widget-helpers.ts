import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export interface TSubOrgDescendants {
  orgIds: string[];
  projectIds: string[];
}

export const getSubOrgDescendants = async (db: TDbClient, subOrgId: string): Promise<TSubOrgDescendants> => {
  const descendantOrgs = await db.replicaNode().raw<{ rows: Array<{ id: string }> }>(
    `
    WITH RECURSIVE descendants AS (
      SELECT id FROM ${TableName.Organization} WHERE id = ?
      UNION ALL
      SELECT o.id FROM ${TableName.Organization} o
      INNER JOIN descendants d ON o."parentOrgId" = d.id
    )
    SELECT id FROM descendants
  `,
    [subOrgId]
  );

  const orgIds = descendantOrgs.rows.map((r) => r.id);

  const projects = await db
    .replicaNode()(TableName.Project)
    .whereIn("orgId", orgIds)
    .select("id");

  return {
    orgIds,
    projectIds: projects.map((p) => p.id)
  };
};
