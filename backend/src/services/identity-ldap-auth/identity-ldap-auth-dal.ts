import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
// not re-exported by the schemas barrel
import { TIdentityLdapAuthsUpdate } from "@app/db/schemas/identity-ldap-auths";
import { ormify } from "@app/lib/knex";

export type TIdentityLdapAuthDALFactory = ReturnType<typeof identityLdapAuthDALFactory>;

export const identityLdapAuthDALFactory = (db: TDbClient) => {
  const ldapAuthOrm = ormify(db, TableName.IdentityLdapAuth);

  // narrow returning: template propagation only needs the affected identity ids, not the
  // full rows with their encrypted credential buffers
  const updateByTemplateId = async (
    { templateId, identityIds }: { templateId: string; identityIds?: string[] },
    data: TIdentityLdapAuthsUpdate,
    tx?: Knex
  ): Promise<{ identityId: string }[]> => {
    const query = (tx || db)(TableName.IdentityLdapAuth).where({ templateId });
    if (identityIds) void query.whereIn("identityId", identityIds);
    const docs: { identityId: string }[] = await query.update(data).returning("identityId");
    return docs;
  };

  return { ...ldapAuthOrm, updateByTemplateId };
};
