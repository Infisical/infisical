import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TPkiAcmeAccountsInsert, TPkiAcmeAccountsUpdate } from "@app/db/schemas/pki-acme-accounts";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiAcmeAccountDALFactory = ReturnType<typeof pkiAcmeAccountDALFactory>;

export const pkiAcmeAccountDALFactory = (db: TDbClient) => {
  const pkiAcmeAccountOrm = ormify(db, TableName.PkiAcmeAccount);

  const create = async (data: TPkiAcmeAccountsInsert, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeAccount).insert(data).returning("*");
      const [account] = result;

      if (!account) {
        throw new Error("Failed to create PKI ACME account");
      }

      return account;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create PKI ACME account" });
    }
  };

  const updateById = async (id: string, data: TPkiAcmeAccountsUpdate, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeAccount).where({ id }).update(data).returning("*");
      const [account] = result;

      if (!account) {
        return null;
      }

      return account;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update PKI ACME account" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const account = await (tx || db)(TableName.PkiAcmeAccount).where({ id }).first();

      return account || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME account by id" });
    }
  };

  const findByProfileId = async (profileId: string, tx?: Knex) => {
    try {
      const account = await (tx || db)(TableName.PkiAcmeAccount).where({ profileId }).first();

      return account || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME account by profile id" });
    }
  };

  const findByPublicKey = async (profileId: string, alg: string, publicKey: unknown, tx?: Knex) => {
    try {
      const account = await (tx || db)(TableName.PkiAcmeAccount).where({ profileId, alg, publicKey }).first();

      return account || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME account by public key and alg" });
    }
  };

  const findManyByProfileId = async (profileId: string, tx?: Knex) => {
    try {
      const accounts = await (tx || db)(TableName.PkiAcmeAccount).where({ profileId });

      return accounts;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find many PKI ACME accounts by profile id" });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeAccount).where({ id }).delete().returning("*");
      const [account] = result;

      return account || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete PKI ACME account by id" });
    }
  };

  return {
    ...pkiAcmeAccountOrm,
    create,
    updateById,
    findById,
    findByProfileId,
    findByPublicKey,
    findManyByProfileId,
    deleteById
  };
};
