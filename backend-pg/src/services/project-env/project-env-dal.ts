import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectEnvDalFactory = ReturnType<typeof projectEnvDalFactory>;

export const projectEnvDalFactory = (db: TDbClient) => {
  const projectEnvOrm = ormify(db, TableName.Environment);
  return projectEnvOrm;
};
