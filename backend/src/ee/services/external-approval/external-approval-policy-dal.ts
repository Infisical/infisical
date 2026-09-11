import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TExternalApprovalPolicyDALFactory = TOrmify<TableName.ExternalApprovalPolicy>;

export const externalApprovalPolicyDALFactory = (db: TDbClient): TExternalApprovalPolicyDALFactory => {
  const orm = ormify(db, TableName.ExternalApprovalPolicy);

  return {
    ...orm,
    findById: (id, tx) => orm.findById(id, tx ?? db),
    findOne: (filter, tx) => orm.findOne(filter, tx ?? db),
    find: (filter, opts) => orm.find(filter, { ...(opts ?? {}), tx: opts?.tx ?? db })
  };
};
