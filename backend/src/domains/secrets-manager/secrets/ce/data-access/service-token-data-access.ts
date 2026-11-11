import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

export type TServiceTokenGrant = { id: string; projectId: string; scopes?: unknown; permissions: string[] };

// Reads service_tokens (legacy Secret Manager tokens), not in this domain yet: a declared exception.
export class ServiceTokenDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async findById(id: string): Promise<TServiceTokenGrant | undefined> {
    try {
      const row = await this.db
        .reader()(TableName.ServiceToken)
        .where({ id })
        .first("id", "projectId", "scopes", "permissions");
      return row ? { ...row, permissions: row.permissions ?? [] } : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find service token" });
    }
  }
}
