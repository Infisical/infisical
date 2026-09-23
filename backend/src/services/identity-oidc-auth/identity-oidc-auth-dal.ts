import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityOidcAuthsUpdate } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityOidcAuthDALFactory = ReturnType<typeof identityOidcAuthDALFactory>;

export const identityOidcAuthDALFactory = (db: TDbClient) => {
  const oidcAuthOrm = ormify(db, TableName.IdentityOidcAuth);

  // narrow returning: template propagation only needs the affected identity ids, not the
  // full rows with their encrypted credential buffers
  const updateByTemplateId = async (
    { templateId, identityIds }: { templateId: string; identityIds?: string[] },
    data: TIdentityOidcAuthsUpdate,
    tx?: Knex
  ): Promise<{ identityId: string }[]> => {
    const query = (tx || db)(TableName.IdentityOidcAuth).where({ templateId });
    if (identityIds) void query.whereIn("identityId", identityIds);
    const docs: { identityId: string }[] = await query.update(data).returning("identityId");
    return docs;
  };

  return { ...oidcAuthOrm, updateByTemplateId };
};
