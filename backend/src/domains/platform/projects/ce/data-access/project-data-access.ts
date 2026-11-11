import { ProjectType, TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { Project } from "../model/project";

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

// Reads projects, and organizations to find an org's sub-orgs; the Organizations domain owns that table.
export class ProjectDataAccess {
  constructor(private readonly db: DataAccessDb) {}

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

  async findById(projectId: string, options?: TReadOptions): Promise<Project | undefined> {
    try {
      const row = await this.db
        .reader(options)(TableName.Project)
        .where({ id: projectId })
        .first("id", "name", "slug", "orgId", "type", "enforceEncryptedSecretManagerSecretMetadata");
      return row ? Project.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project" });
    }
  }

  // When the project is scheduled for deletion, or "" when it is not: folded into cached permissions, so a
  // soft-deleted project stops serving them.
  async findDeletionState(projectId: string): Promise<string> {
    try {
      const row = await this.db.reader()(TableName.Project).where({ id: projectId }).first("deleteAfter");
      return row?.deleteAfter ? new Date(row.deleteAfter).toISOString() : "";
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project deletion state" });
    }
  }
}
