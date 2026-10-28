import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TDelegatedApprovalRequests, TDelegatedApprovalRequestsUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TDelegatedApprovalRequestDetails } from "./delegated-approval-schemas";

export type TDelegatedApprovalRequestDALFactory = ReturnType<typeof delegatedApprovalRequestDALFactory>;

export const delegatedApprovalRequestDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.DelegatedApprovalRequests);

  const primaryNode = () => db.primaryNode();

  const updateWithDetails = async (
    filter: Partial<Pick<TDelegatedApprovalRequests, "id" | "requestId" | "status" | "dispatchEventId">>,
    {
      details,
      ...columns
    }: Omit<TDelegatedApprovalRequestsUpdate, "details"> & { details?: Partial<TDelegatedApprovalRequestDetails> },
    tx?: Knex
  ) => {
    try {
      const patch = details ? JSON.stringify(details) : "{}";
      const rows = await (tx || db)(TableName.DelegatedApprovalRequests)
        .where(filter)
        .update({
          ...columns,
          ...(patch !== "{}" ? { details: db.raw(`COALESCE("details", '{}'::jsonb) || ?::jsonb`, [patch]) } : {})
        })
        .returning("*");
      return rows as TDelegatedApprovalRequests[];
    } catch (error) {
      throw new DatabaseError({ error, name: "DelegatedApprovalRequest: updateWithDetails" });
    }
  };

  return { ...orm, primaryNode, updateWithDetails };
};
