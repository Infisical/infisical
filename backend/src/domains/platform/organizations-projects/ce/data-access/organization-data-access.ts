import { ProjectType, TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

// Project types that do not take a workspace slot on a plan.
const UNCOUNTED_WORKSPACE_TYPES = [
  ProjectType.CertificateManager,
  ProjectType.SecretScanning,
  ProjectType.PAM,
  ProjectType.AgentVault,
  // Rows of the removed SSH and Agent Sentinel products are left in place (see migration 20260729150000)
  // but must not consume workspace quota.
  "ssh",
  "ai"
];

// Reads the organizations and projects tables, which a future domain will own; see ../../AGENTS.md.
export class OrganizationDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
  async findRootOrgId(orgId: string, options?: TReadOptions): Promise<string | null> {
    try {
      const db = this.db.reader(options);
      const row = (await db(TableName.Organization)
        .where("id", orgId)
        .select(db.raw(`COALESCE("rootOrgId", "id") as "rootOrgId"`))
        .first()) as { rootOrgId?: string } | undefined;
      return row?.rootOrgId ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root org id" });
    }
  }

  // The org's root, or the org itself when it does not exist.
  async resolveRootOrgId(orgId: string, options?: TReadOptions): Promise<string> {
    return (await this.findRootOrgId(orgId, options)) ?? orgId;
  }

  // Live projects that take a workspace slot, in the org and its sub-orgs.
  async countWorkspaces(orgId: string, options?: TReadOptions): Promise<number> {
    try {
      const knex = this.db.reader(options);
      const row = (await knex(TableName.Project)
        .whereNull("deleteAfter")
        .whereNotIn("type", UNCOUNTED_WORKSPACE_TYPES)
        .where((bd) => {
          void bd
            .where({ orgId })
            .orWhereIn("orgId", knex(TableName.Organization).where({ rootOrgId: orgId }).select("id"));
        })
        .count("* as count")
        .first()) as { count?: string | number } | undefined;
      return Number(row?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count workspaces" });
    }
  }
}
