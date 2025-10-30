import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TPkiAcmeAuthsInsert, TPkiAcmeAuthsUpdate } from "@app/db/schemas/pki-acme-auths";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiAcmeAuthDALFactory = ReturnType<typeof pkiAcmeAuthDALFactory>;

export const pkiAcmeAuthDALFactory = (db: TDbClient) => {
  const pkiAcmeAuthOrm = ormify(db, TableName.PkiAcmeAuth);

  const create = async (data: TPkiAcmeAuthsInsert, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeAuth).insert(data).returning("*");
      const [auth] = result;

      if (!auth) {
        throw new Error("Failed to create PKI ACME auth");
      }

      return auth;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create PKI ACME auth" });
    }
  };

  const updateById = async (id: string, data: TPkiAcmeAuthsUpdate, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeAuth).where({ id }).update(data).returning("*");
      const [auth] = result;

      if (!auth) {
        return null;
      }

      return auth;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update PKI ACME auth" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const auth = await (tx || db)(TableName.PkiAcmeAuth).where({ id }).first();

      return auth || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME auth by id" });
    }
  };

  return {
    ...pkiAcmeAuthOrm,
    create,
    updateById,
    findById
  };
};
