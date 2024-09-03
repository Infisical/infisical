import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectSlackConfigDALFactory = ReturnType<typeof projectSlackConfigDALFactory>;

export const projectSlackConfigDALFactory = (db: TDbClient) => {
  const projectSlackConfigOrm = ormify(db, TableName.ProjectSlackConfigs);

  return projectSlackConfigOrm;
};
