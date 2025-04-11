import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSshHostLoginUserMappingDALFactory = ReturnType<typeof sshHostLoginUserMappingDALFactory>;

export const sshHostLoginUserMappingDALFactory = (db: TDbClient) => {
  const sshHostLoginUserMappingOrm = ormify(db, TableName.SshHostLoginUserMapping);
  return sshHostLoginUserMappingOrm;
};
