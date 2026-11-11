import { TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { ActorOrganization, TActorOrganizationProps } from "../model/actor-organization";

// Owns organizations.
export class OrganizationDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  // The org with its root org's sign-in policy. Undefined when the org does not exist.
  async findActorOrganization(orgId: string, options?: TReadOptions): Promise<ActorOrganization | undefined> {
    try {
      const knex = this.db.reader(options);
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
        .first<TActorOrganizationProps | undefined>();
      return row ? ActorOrganization.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find actor organization" });
    }
  }

  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
  async findRootOrgId(orgId: string, options?: TReadOptions): Promise<string | null> {
    try {
      const db = this.db.reader(options);
      const row = (await db(TableName.Organization)
        .where("id", orgId)
        .select(db.raw(`COALESCE("rootOrgId", "id") as "rootOrgId"`))
        .first()) as { rootOrgId?: string } | undefined;
      return row?.rootOrgId ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root org id" });
    }
  }

  // The org's root, or the org itself when it does not exist.
  async resolveRootOrgId(orgId: string, options?: TReadOptions): Promise<string> {
    return (await this.findRootOrgId(orgId, options)) ?? orgId;
  }
}
