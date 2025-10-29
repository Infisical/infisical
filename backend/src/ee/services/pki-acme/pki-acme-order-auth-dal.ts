import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TPkiAcmeOrderAuthsInsert } from "@app/db/schemas/pki-acme-order-auths";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiAcmeOrderAuthDALFactory = ReturnType<typeof pkiAcmeOrderAuthDALFactory>;

export const pkiAcmeOrderAuthDALFactory = (db: TDbClient) => {
  const pkiAcmeOrderAuthOrm = ormify(db, TableName.PkiAcmeOrderAuth);

  const insertMany = async (rows: TPkiAcmeOrderAuthsInsert[], tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeOrderAuth).insert(rows).returning("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert many PKI ACME order auths" });
    }
  };

  return {
    ...pkiAcmeOrderAuthOrm,
    insertMany
  };
};
