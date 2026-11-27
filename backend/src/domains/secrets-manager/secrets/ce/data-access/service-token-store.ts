import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { ServiceToken } from "../models/service-token";
import { TServiceTokenStore } from "../services/dependencies";

// Reads service_tokens, which no domain owns yet: a declared exception (see ../../AGENTS.md).
export class ServiceTokenStore implements TServiceTokenStore {
  constructor(private readonly connection: TStoreConnection) {}

  async findById(serviceTokenId: string, options?: TReadOptions): Promise<ServiceToken | null> {
    try {
      const row = await this.connection
        .reader(options)(TableName.ServiceToken)
        .where({ id: serviceTokenId })
        .first("id", "projectId", "scopes", "permissions");
      return row
        ? ServiceToken.restore({
            id: row.id,
            projectId: row.projectId,
            scopes: row.scopes,
            permissions: row.permissions ?? []
          })
        : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find service token" });
    }
  }
}
