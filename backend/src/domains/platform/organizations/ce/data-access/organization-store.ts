import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { TOrganization, TOrganizationStore } from "../services/dependencies";

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
}
