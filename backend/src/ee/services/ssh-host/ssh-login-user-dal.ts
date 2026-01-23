import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSshHostLoginUserDALFactory = ReturnType<typeof sshHostLoginUserDALFactory>;

export const sshHostLoginUserDALFactory = (db: TDbClient) => {
  const sshHostLoginUserOrm = ormify(db, TableName.SshHostLoginUser);
  return sshHostLoginUserOrm;
};
