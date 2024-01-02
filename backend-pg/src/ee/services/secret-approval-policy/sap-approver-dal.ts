import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSapApproverDalFactory = ReturnType<typeof sapApproverDalFactory>;

export const sapApproverDalFactory = (db: TDbClient) => {
  const sapApproverOrm = ormify(db, TableName.SapApprover);
  return sapApproverOrm;
};
