import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { orgTreeIds } from "@app/lib/knex";

export type TLicenseV2BreakdownDALFactory = ReturnType<typeof licenseV2BreakdownDALFactory>;

export type TScopeOrgRow = { id: string; name: string; isRoot: boolean };
export type TRootOrgRow = { id: string; name: string };

export type TScopeProjectRow = { id: string; name: string; orgId: string };

export const licenseV2BreakdownDALFactory = (db: TDbClient) => {
  const findOrgTreeNames = async (orgId: string): Promise<TScopeOrgRow[]> => {
    try {
      const rows = (await db
        .replicaNode()(TableName.Organization)
        .whereIn("id", orgTreeIds(db.replicaNode(), orgId))
        .select("id", "name", "rootOrgId")) as { id: string; name: string; rootOrgId: string | null }[];

      // A root org is the one carrying no rootOrgId; every sub-org points back at it.
      return rows.map((row) => ({ id: row.id, name: row.name, isRoot: !row.rootOrgId }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org tree names for usage breakdown" });
    }
  };

  // Every organization on the instance, for the instance-wide breakdown. On self-hosted the meters
  // count the whole database rather than one tree (usage-counters passes no org when !isCloud), so a
  // tree-scoped roster would leave the parts short of the figure the customer is billed on.
  const findAllOrgNames = async (): Promise<TScopeOrgRow[]> => {
    try {
      const rows = (await db.replicaNode()(TableName.Organization).select("id", "name", "rootOrgId")) as {
        id: string;
        name: string;
        rootOrgId: string | null;
      }[];

      return rows.map((row) => ({ id: row.id, name: row.name, isRoot: !row.rootOrgId }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all org names for usage breakdown" });
    }
  };

  const findProjectNames = async (projectIds: string[]): Promise<TScopeProjectRow[]> => {
    if (!projectIds.length) {
      return [];
    }

    try {
      return (await db
        .replicaNode()(TableName.Project)
        .whereIn("id", projectIds)
        .whereNull("deleteAfter")
        .select("id", "name", "orgId")) as TScopeProjectRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project names for usage breakdown" });
    }
  };

  const findAllRootOrgs = async (dto: {
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ orgs: TRootOrgRow[]; totalCount: number }> => {
    try {
      const baseQuery = db.replicaNode()(TableName.Organization).whereNull("rootOrgId");
      if (dto.search) {
        void baseQuery.whereILike("name", `%${sanitizeSqlLikeString(dto.search)}%`);
      }

      const [totalResult, orgs] = await Promise.all([
        baseQuery.clone().count({ count: "*" }).first(),
        baseQuery.clone().orderBy("name", "asc").limit(dto.limit).offset(dto.offset).select("id", "name")
      ]);

      return { orgs: orgs as TRootOrgRow[], totalCount: Number(totalResult?.count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all root organizations for billing" });
    }
  };

  return { findOrgTreeNames, findAllOrgNames, findProjectNames, findAllRootOrgs };
};
