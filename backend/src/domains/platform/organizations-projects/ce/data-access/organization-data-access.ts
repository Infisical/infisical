import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { TOrganization, TOrganizationDataAccess } from "../service/dependencies";

type TOrganizationRow = { id: string; name: string; slug: string };

const toOrganization = (row: TOrganizationRow): TOrganization => ({ id: row.id, name: row.name, slug: row.slug });

const UNCOUNTED_WORKSPACE_TYPES = [
  ProjectType.CertificateManager,
  ProjectType.SecretScanning,
  ProjectType.PAM,
  ProjectType.AgentVault,
  // Removed products, rows kept (see migration 20260729150000) but they shouldn't use workspace quota.
  "ssh",
  "ai"
];

// Reads tables a future domain will own; see ../../AGENTS.md.
export class OrganizationDataAccess implements TOrganizationDataAccess {
  constructor(private readonly db: TDbClient) {}

  async findRootOrgId(orgId: string): Promise<string | null> {
    try {
      const row = (await this.db
        .replicaNode()(TableName.Organization)
        .where("id", orgId)
        .select(this.db.raw(`COALESCE("rootOrgId", "id") as "rootOrgId"`))
        .first()) as { rootOrgId?: string } | undefined;
      return row?.rootOrgId ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root org id" });
    }
  }

  async findById(orgId: string): Promise<TOrganization | null> {
    try {
      const row = (await this.db
        .replicaNode()(TableName.Organization)
        .where("id", orgId)
        .select("id", "name", "slug")
        .first()) as TOrganizationRow | undefined;
      return row ? toOrganization(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find organization" });
    }
  }

  async countWorkspaces(orgId: string): Promise<number> {
    try {
      const knex = this.db.replicaNode();
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
