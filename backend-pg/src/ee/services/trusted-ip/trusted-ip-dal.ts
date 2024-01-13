import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TTrustedIpDalFactory = ReturnType<typeof trustedIpDalFactory>;

export const trustedIpDalFactory = (db: TDbClient) => {
  const trustedIpOrm = ormify(db, TableName.TrustedIps);
  return trustedIpOrm;
};
