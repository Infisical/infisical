import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TSecretFolders } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSecretFolderDalFactory = ReturnType<typeof secretFolderDalFactory>;
// never change this. If u do write a migration for it
export const ROOT_FOLDER_NAME = "root";
export const secretFolderDalFactory = (db: TDbClient) => {
  const secretFolderOrm = ormify(db, TableName.SecretFolder);

  const findBySecretPath = async (
    projectId: string,
    environment: string,
    path: string,
    tx?: Knex
  ) => {
    try {
      const folder: TSecretFolders | undefined = await (tx || db)(TableName.SecretFolder)
        .join(
          TableName.Environment,
          `${TableName.SecretFolder}.envId`,
          `${TableName.Environment}.id`
        )
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.id`, projectId)
        .where(`${TableName.Environment}.slug`, environment)
        .where(`${TableName.SecretFolder}.name`, "root")
        .select(`${TableName.SecretFolder}.*`)
        .first();
      return folder;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  return { ...secretFolderOrm, findBySecretPath };
};
