import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSshHostLoginMappingDALFactory = ReturnType<typeof sshHostLoginMappingDALFactory>;

export const sshHostLoginMappingDALFactory = (db: TDbClient) => {
  const sshHostLoginMappingOrm = ormify(db, TableName.SshHostLoginMapping);
  return sshHostLoginMappingOrm;
};
