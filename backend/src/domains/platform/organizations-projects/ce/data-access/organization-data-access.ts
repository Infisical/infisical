import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { TOrganization, TOrganizationDataAccess } from "../service/dependencies";

// The columns of an organizations row this domain reads.
type TOrganizationRow = { id: string; name: string; slug: string };

const toOrganization = (row: TOrganizationRow): TOrganization => ({ id: row.id, name: row.name, slug: row.slug });

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
export class OrganizationDataAccess implements TOrganizationDataAccess {
  constructor(private readonly db: TDbClient) {}

  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
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

  // Live projects that take a workspace slot, in the org and its sub-orgs.
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
