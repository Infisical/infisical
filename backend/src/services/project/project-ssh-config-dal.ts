import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TProjectSshConfigDALFactory = ReturnType<typeof projectSshConfigDALFactory>;

export const projectSshConfigDALFactory = (db: TDbClient) => {
  const projectSshConfigOrm = ormify(db, TableName.ProjectSshConfig);

  return projectSshConfigOrm;
};
