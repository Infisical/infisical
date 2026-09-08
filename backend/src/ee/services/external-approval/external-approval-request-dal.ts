import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TExternalApprovalRequestDALFactory = TOrmify<TableName.ExternalApprovalRequest>;

export const externalApprovalRequestDALFactory = (db: TDbClient): TExternalApprovalRequestDALFactory => {
  const orm = ormify(db, TableName.ExternalApprovalRequest);

  return {
    ...orm,
    findById: (id, tx) => orm.findById(id, tx ?? db),
    findOne: (filter, tx) => orm.findOne(filter, tx ?? db),
    find: (filter, opts) => orm.find(filter, { ...(opts ?? {}), tx: opts?.tx ?? db })
  };
};
