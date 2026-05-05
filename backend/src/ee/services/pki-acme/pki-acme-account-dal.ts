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

  const findByProfileIdAndPublicKeyThumbprintAndAlg = async (
    profileId: string,
    alg: string,
    publicKeyThumbprint: string,
    tx?: Knex
  ) => {
    try {
      const account = await (tx || db)(TableName.PkiAcmeAccount).where({ profileId, alg, publicKeyThumbprint }).first();
      return account || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME account by profile id, public key thumbprint and alg" });
    }
  };

  const findApplicationProfileId = async (applicationId: string, profileId: string, tx?: Knex) => {
    try {
      const row = await (tx || db.replicaNode())(TableName.PkiApplicationProfile)
        .where({ applicationId, profileId })
        .select("id")
        .first();
      return row?.id ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find application profile junction id" });
    }
  };

  const findApplicationIdByJunctionId = async (junctionId: string, tx?: Knex) => {
    try {
      const row = await (tx || db.replicaNode())(TableName.PkiApplicationProfile)
        .where({ id: junctionId })
        .select("applicationId")
        .first();
      return row?.applicationId ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find application id by junction id" });
    }
  };

  return {
    ...pkiAcmeAccountOrm,
    findByProjectIdAndAccountId,
    findByProfileIdAndPublicKeyThumbprintAndAlg,
    findApplicationProfileId,
    findApplicationIdByJunctionId
  };
};
