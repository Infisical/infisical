import { TableName, TOrganizations } from "@app/db/schemas";
import type { TActorOrg } from "@app/domains/lib/actor-context";
import { toCount, TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { orgTreeIds } from "@app/lib/knex";

import {
  TListRootOrganizationsQuery,
  TOrganization,
  TOrganizationName,
  TOrganizationPage,
  TOrganizationStore
} from "../services/dependencies";

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

  async listOrgTreeNames(orgId: string, options?: TReadOptions): Promise<TOrganizationName[]> {
    try {
      const knex = this.connection.reader(options);
      return (await knex(TableName.Organization)
        .whereIn("id", orgTreeIds(knex, orgId))
        .select("id", "name", "rootOrgId")) as TOrganizationName[];
    } catch (error) {
      throw new DatabaseError({ error, name: "List org tree names" });
    }
  }

  async listAllOrgNames(options?: TReadOptions): Promise<TOrganizationName[]> {
    try {
      return (await this.connection
        .reader(options)(TableName.Organization)
        .select("id", "name", "rootOrgId")) as TOrganizationName[];
    } catch (error) {
      throw new DatabaseError({ error, name: "List all org names" });
    }
  }

  async listRootOrganizations(query: TListRootOrganizationsQuery, options?: TReadOptions): Promise<TOrganizationPage> {
    try {
      const knex = this.connection.reader(options);
      const base = knex(TableName.Organization).whereNull("rootOrgId");
      if (query.search) {
        const term = `%${sanitizeSqlLikeString(query.search)}%`;
        void base.where((builder) => void builder.whereILike("name", term).orWhereILike("slug", term));
      }

      const [totalRow, organizations] = await Promise.all([
        base.clone().count({ count: "*" }).first(),
        base
          .clone()
          .orderBy("name", "asc")
          .limit(query.limit)
          .offset(query.offset)
          .select("id", "name", "slug") as Promise<TOrganization[]>
      ]);

      return { organizations, totalCount: toCount((totalRow as { count?: string | number } | undefined)?.count) };
    } catch (error) {
      throw new DatabaseError({ error, name: "List root organizations" });
    }
  }
}
