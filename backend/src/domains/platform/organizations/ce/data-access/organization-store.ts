import { TableName, TOrganizations } from "@app/db/schemas";
import type { TActorOrg } from "@app/domains/lib/actor-context";
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

  async findActorOrg(orgId: string, options?: TReadOptions): Promise<TActorOrg | null> {
    try {
      const knex = this.connection.reader(options);
      const row = await knex(TableName.Organization)
        .joinRaw(
          `LEFT JOIN "${TableName.Organization}" AS root ON root.id = COALESCE("${TableName.Organization}"."rootOrgId", "${TableName.Organization}".id)`
        )
        .where(`${TableName.Organization}.id`, orgId)
        .select(
          knex.ref("id").withSchema(TableName.Organization),
          knex.ref("name").withSchema(TableName.Organization),
          knex.ref("rootOrgId").withSchema(TableName.Organization),
          knex.ref("parentOrgId").withSchema(TableName.Organization),
          knex.ref("shouldUseNewPrivilegeSystem").withSchema(TableName.Organization),
          knex.ref("authEnforced").withSchema("root").as("rootAuthEnforced"),
          knex.ref("googleSsoAuthEnforced").withSchema("root").as("rootGoogleSsoAuthEnforced"),
          knex.ref("bypassOrgAuthEnabled").withSchema("root").as("rootBypassOrgAuthEnabled")
        )
        .first<
          | (Pick<TOrganizations, "id" | "name" | "rootOrgId" | "parentOrgId" | "shouldUseNewPrivilegeSystem"> & {
              rootAuthEnforced: boolean | null;
              rootGoogleSsoAuthEnforced: boolean | null;
              rootBypassOrgAuthEnabled: boolean | null;
            })
          | undefined
        >();
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        rootOrgId: row.rootOrgId ?? row.id,
        parentOrgId: row.parentOrgId ?? row.id,
        shouldUseNewPrivilegeSystem: Boolean(row.shouldUseNewPrivilegeSystem),
        ssoPolicy: {
          authEnforced: Boolean(row.rootAuthEnforced),
          googleSsoAuthEnforced: Boolean(row.rootGoogleSsoAuthEnforced),
          bypassOrgAuthEnabled: Boolean(row.rootBypassOrgAuthEnabled)
        }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find actor organization" });
    }
  }
}
