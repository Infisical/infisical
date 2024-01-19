import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSapApproverDALFactory = ReturnType<typeof sapApproverDALFactory>;

export const sapApproverDALFactory = (db: TDbClient) => {
  const sapApproverOrm = ormify(db, TableName.SapApprover);
  return sapApproverOrm;
};
