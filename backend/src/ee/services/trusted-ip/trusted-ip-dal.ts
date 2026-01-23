import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TTrustedIpDALFactory = TOrmify<TableName.TrustedIps>;

export const trustedIpDALFactory = (db: TDbClient): TTrustedIpDALFactory => {
  const trustedIpOrm = ormify(db, TableName.TrustedIps);
  return trustedIpOrm;
};
