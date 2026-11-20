import { ProjectType, TableName } from "@app/db/schemas";
import { toCount, TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
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
  constructor(private readonly connection: TStoreConnection) {}

  async findRootOrgId(orgId: string, options?: TReadOptions): Promise<string | null> {
    try {
      const knex = this.connection.reader(options);
      const row = (await knex(TableName.Organization)
        .where("id", orgId)
        .select(knex.raw(`COALESCE("rootOrgId", "id") as "rootOrgId"`))
        .first()) as { rootOrgId?: string } | undefined;
      return row?.rootOrgId ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root org id" });
    }
  }

  async findById(orgId: string, options?: TReadOptions): Promise<TOrganization | null> {
    try {
      const row = (await this.connection
        .reader(options)(TableName.Organization)
        .where("id", orgId)
        .select("id", "name", "slug")
        .first()) as TOrganization | undefined;
      return row ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find organization" });
    }
  }

  async countWorkspaces(orgId: string, options?: TReadOptions): Promise<number> {
    try {
      const knex = this.connection.reader(options);
      const row = (await knex(TableName.Project)
        .whereNull("deleteAfter")
        .whereNotIn("type", UNCOUNTED_WORKSPACE_TYPES)
        // One IN over the org and its sub-orgs, not "orgId = ? OR orgId IN (...)": the OR keeps Postgres off the
        // index and scans every project.
        .whereIn("orgId", knex(TableName.Organization).where("id", orgId).orWhere("rootOrgId", orgId).select("id"))
        .count("* as count")
        .first()) as { count?: string | number } | undefined;
      return toCount(row?.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count workspaces" });
    }
  }
}
