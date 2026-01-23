/* eslint-disable no-case-declarations */
import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { buildFindFilter, ormify } from "@app/lib/knex";

import { IdentityAuthTemplateMethod } from "./identity-auth-template-enums";

export type TIdentityAuthTemplateDALFactory = ReturnType<typeof identityAuthTemplateDALFactory>;

export const identityAuthTemplateDALFactory = (db: TDbClient) => {
  const identityAuthTemplateOrm = ormify(db, TableName.IdentityAuthTemplate);

  const findByOrgId = async (
    orgId: string,
    { limit, offset, search, tx }: { limit?: number; offset?: number; search?: string; tx?: Knex } = {}
  ) => {
    let query = (tx || db.replicaNode())(TableName.IdentityAuthTemplate).where({ orgId });
    let countQuery = (tx || db.replicaNode())(TableName.IdentityAuthTemplate).where({ orgId });

    if (search) {
      const searchFilter = `%${search.toLowerCase()}%`;
      query = query.whereRaw("LOWER(name) LIKE ?", [searchFilter]);
      countQuery = countQuery.whereRaw("LOWER(name) LIKE ?", [searchFilter]);
    }

    query = query.orderBy("createdAt", "desc");

    if (limit !== undefined) {
      query = query.limit(limit);
    }
    if (offset !== undefined) {
      query = query.offset(offset);
    }

    const docs = await query;

    const [{ count }] = (await countQuery.count("* as count")) as [{ count: string | number }];

    return { docs, totalCount: Number(count) };
  };

  const findByAuthMethod = async (authMethod: string, orgId: string, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.IdentityAuthTemplate)
      .where({ authMethod, orgId })
      .orderBy("createdAt", "desc");
    const docs = await query;
    return docs;
  };

  const findTemplateUsages = async (templateId: string, authMethod: string, tx?: Knex) => {
    switch (authMethod) {
      case IdentityAuthTemplateMethod.LDAP:
        const query = (tx || db.replicaNode())(TableName.IdentityLdapAuth)
          .join(TableName.Identity, `${TableName.IdentityLdapAuth}.identityId`, `${TableName.Identity}.id`)
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          .where(buildFindFilter({ templateId }, TableName.IdentityLdapAuth))
          .select(
            db.ref("identityId").withSchema(TableName.IdentityLdapAuth),
            db.ref("name").withSchema(TableName.Identity).as("identityName")
          );
        const docs = await query;
        return docs;
      default:
        return [];
    }
  };

  const findByIdAndOrgId = async (id: string, orgId: string, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.IdentityAuthTemplate).where({ id, orgId });
    const doc = await query;
    return doc?.[0];
  };

  return {
    ...identityAuthTemplateOrm,
    findByOrgId,
    findByAuthMethod,
    findTemplateUsages,
    findByIdAndOrgId
  };
};
