import { Knex } from "knex";

import { ProjectType, TableName } from "@app/db/schemas";
import { toCount } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { TOrganization, TOrganizationStore } from "../services/dependencies";

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
export class OrganizationStore implements TOrganizationStore {
  // A source, not a handle: replicaNode() picks a replica per call, and the stores bundle passes its transaction.
  constructor(private readonly knex: () => Knex) {}

  async findRootOrgId(orgId: string): Promise<string | null> {
    try {
      const row = (await this.knex()(TableName.Organization)
        .where("id", orgId)
        .select(this.knex().raw(`COALESCE("rootOrgId", "id") as "rootOrgId"`))
        .first()) as { rootOrgId?: string } | undefined;
      return row?.rootOrgId ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root org id" });
    }
  }

  async findById(orgId: string): Promise<TOrganization | null> {
    try {
      const row = (await this.knex()(TableName.Organization)
        .where("id", orgId)
        .select("id", "name", "slug")
        .first()) as TOrganization | undefined;
      return row ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find organization" });
    }
  }

  async countWorkspaces(orgId: string): Promise<number> {
    try {
      const knex = this.knex();
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
      return toCount(row?.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count workspaces" });
    }
  }
}
