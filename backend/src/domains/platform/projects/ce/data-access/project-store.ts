import { ProjectType, TableName } from "@app/db/schemas";
import { toCount, TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { Project } from "../models/project";
import { TProjectStore } from "../services/dependencies";

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
export class ProjectStore implements TProjectStore {
  constructor(private readonly connection: TStoreConnection) {}

  async countWorkspaces(orgId: string, options?: TReadOptions): Promise<number> {
    try {
      const knex = this.connection.reader(options);
      const row = (await knex(TableName.Project)
        .whereNull("deleteAfter")
        .whereNotIn("type", UNCOUNTED_WORKSPACE_TYPES)
        // Single IN over org + sub-orgs. "orgId = ? OR orgId IN (...)" skips the index and scans every project.
        .whereIn("orgId", knex(TableName.Organization).where("id", orgId).orWhere("rootOrgId", orgId).select("id"))
        .count("* as count")
        .first()) as { count?: string | number } | undefined;
      return toCount(row?.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count workspaces" });
    }
  }

  async findById(projectId: string, options?: TReadOptions): Promise<Project | null> {
    try {
      const row = await this.connection
        .reader(options)(TableName.Project)
        .where({ id: projectId })
        .whereNull("deleteAfter")
        .first("id", "name", "slug", "orgId", "type", "enforceEncryptedSecretManagerSecretMetadata");
      return row ? Project.restore(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project" });
    }
  }

  async findVersion(projectId: string, options?: TReadOptions): Promise<string> {
    try {
      const knex = this.connection.reader(options);
      // Read as text so two changes in the same millisecond still differ.
      const row = (await knex(TableName.Project)
        .where({ id: projectId })
        .first(knex.raw('"updatedAt"::text as "updatedAt"'), knex.raw('"deleteAfter"::text as "deleteAfter"'))) as
        | { updatedAt: string; deleteAfter: string | null }
        | undefined;
      if (!row) return "missing";
      return `${row.updatedAt}:${row.deleteAfter ?? ""}`;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project version" });
    }
  }
}
