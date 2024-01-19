import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TTrustedIpDALFactory = ReturnType<typeof trustedIpDALFactory>;

export const trustedIpDALFactory = (db: TDbClient) => {
  const trustedIpOrm = ormify(db, TableName.TrustedIps);
  return trustedIpOrm;
};
