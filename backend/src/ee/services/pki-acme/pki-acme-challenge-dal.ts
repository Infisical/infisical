import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPkiAcmeChallengeDALFactory = ReturnType<typeof pkiAcmeChallengeDALFactory>;

export const pkiAcmeChallengeDALFactory = (db: TDbClient) => {
  const pkiAcmeChallengeOrm = ormify(db, TableName.PkiAcmeChallenge);

  return {
    ...pkiAcmeChallengeOrm
  };
};
