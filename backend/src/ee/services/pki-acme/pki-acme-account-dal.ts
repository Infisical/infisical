import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiAcmeAccountDALFactory = ReturnType<typeof pkiAcmeAccountDALFactory>;

export const pkiAcmeAccountDALFactory = (db: TDbClient) => {
  const pkiAcmeAccountOrm = ormify(db, TableName.PkiAcmeAccount);

  const findByProjectIdAndAccountId = async (profileId: string, id: string, tx?: Knex) => {
    try {
      const account = await (tx || db)(TableName.PkiAcmeAccount).where({ profileId, id }).first();

      return account || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME account by id" });
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

  return {
    ...pkiAcmeAccountOrm,
    findByProjectIdAndAccountId,
    findByPublicKey
  };
};
