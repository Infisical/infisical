import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiSignerCertificateRevocations, TPkiSignerCertificateRevocationsUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { UNSETTLED_SIGNER_REVOCATION_STATUSES } from "./signer-enums";

export type TSignerRevocationDALFactory = ReturnType<typeof signerRevocationDALFactory>;

export const signerRevocationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiSignerCertificateRevocations);

  const findUnsettledForSigner = async (
    signerId: string,
    tx?: Knex
  ): Promise<TPkiSignerCertificateRevocations | undefined> => {
    try {
      return await (tx || db.replicaNode())(TableName.PkiSignerCertificateRevocations)
        .where({ signerId })
        .whereIn("status", [...UNSETTLED_SIGNER_REVOCATION_STATUSES])
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "FindUnsettledSignerRevocation" });
    }
  };

  const updateIfUnsettled = async (
    id: string,
    data: TPkiSignerCertificateRevocationsUpdate,
    tx?: Knex
  ): Promise<TPkiSignerCertificateRevocations | undefined> => {
    try {
      const [row] = (await (tx || db)(TableName.PkiSignerCertificateRevocations)
        .where({ id })
        .whereIn("status", [...UNSETTLED_SIGNER_REVOCATION_STATUSES])
        .update(data)
        .returning("*")) as TPkiSignerCertificateRevocations[];
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateUnsettledSignerRevocation" });
    }
  };

  return { ...orm, findUnsettledForSigner, updateIfUnsettled };
};
