import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { orgTreeIds } from "@app/lib/knex";

export type TLicenseV2BreakdownDALFactory = ReturnType<typeof licenseV2BreakdownDALFactory>;

export type TScopeOrgRow = { id: string; name: string; isRoot: boolean };
export type TRootOrgRow = { id: string; name: string };

// An instance admin picks from this list, and a self-hosted instance is not a multi-tenant estate, so
// the count is in the tens. Capped anyway so a pathological instance cannot return an unbounded list;
// the picker filters client-side, so a cap that hides orgs would be invisible, hence the log.
const ROOT_ORG_LIMIT = 500;
export type TScopeProjectRow = { id: string; name: string; orgId: string };

// Scope names for the usage breakdown. Billing is answered at the root org, so a billing admin reading
// it is shown every sub-org and project the metered total was drawn from, including ones they are not a
// member of: a total the customer is billed on that cannot be explained is worse than naming a project
// they already pay for. Names only, deliberately, and the UI does not link them — nothing here exposes
// a project's contents, and this DAL must not grow fields that would.
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

  const findProjectNames = async (projectIds: string[]): Promise<TScopeProjectRow[]> => {
    if (!projectIds.length) {
      return [];
    }

    try {
      // Soft-deleted projects are excluded from every meter, so one reaching here would be a bug in the
      // count rather than a project to name; leaving it unnamed keeps the two consistent.
      return (await db
        .replicaNode()(TableName.Project)
        .whereIn("id", projectIds)
        .whereNull("deleteAfter")
        .select("id", "name", "orgId")) as TScopeProjectRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project names for usage breakdown" });
    }
  };

  // Every root organization on the instance. Only ever reached for an instance admin on self-hosted,
  // where one licence covers them all; the service is what enforces that.
  const findAllRootOrgs = async (): Promise<TRootOrgRow[]> => {
    try {
      return (await db
        .replicaNode()(TableName.Organization)
        .whereNull("rootOrgId")
        .orderBy("name", "asc")
        .limit(ROOT_ORG_LIMIT)
        .select("id", "name")) as TRootOrgRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all root organizations for billing" });
    }
  };

  return { findOrgTreeNames, findProjectNames, findAllRootOrgs };
};
