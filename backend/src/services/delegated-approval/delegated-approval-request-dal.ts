import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TDelegatedApprovalRequests, TDelegatedApprovalRequestsUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { TDelegatedApprovalRequestDetails } from "./delegated-approval-schemas";

export type TDelegatedApprovalRequestDALFactory = ReturnType<typeof delegatedApprovalRequestDALFactory>;

export type TDelegatedApprovalRequestWithApprovalRequest = TDelegatedApprovalRequests & {
  approvalRequestOrganizationId: string;
  approvalRequestProjectId: string;
};

export const delegatedApprovalRequestDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.DelegatedApprovalRequests);

  const primaryNode = () => db.primaryNode();

  const findByProviderRequestId = async (providerRequestId: string) => {
    try {
      const row = await db
        .primaryNode()(TableName.DelegatedApprovalRequests)
        .join(
          TableName.ApprovalRequests,
          `${TableName.DelegatedApprovalRequests}.requestId`,
          `${TableName.ApprovalRequests}.id`
        )
        .where(`${TableName.DelegatedApprovalRequests}.providerRequestId`, providerRequestId)
        .select(selectAllTableCols(TableName.DelegatedApprovalRequests))
        .select(db.ref("organizationId").withSchema(TableName.ApprovalRequests).as("approvalRequestOrganizationId"))
        .select(db.ref("projectId").withSchema(TableName.ApprovalRequests).as("approvalRequestProjectId"))
        .first();
      return (row as TDelegatedApprovalRequestWithApprovalRequest | undefined) ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "DelegatedApprovalRequest: findByProviderRequestId" });
    }
  };

  // Concurrent claims on one row serialize on its lock, and the loser re-evaluates the WHERE against the
  // winner's write, so only one caller gets the row back.
  const claimDecisionRead = async ({ id, staleBefore }: { id: string; staleBefore: Date }, tx?: Knex) => {
    try {
      const [row] = await (tx || db)(TableName.DelegatedApprovalRequests)
        .where({ id, status: DelegatedApprovalRequestStatus.WaitingApproval })
        .where((qb) => {
          void qb.whereNull("decisionReadRequestedAt").orWhere("decisionReadRequestedAt", "<", staleBefore);
        })
        .update({ decisionReadRequestedAt: new Date() })
        .returning("*");
      return (row as TDelegatedApprovalRequests | undefined) ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "DelegatedApprovalRequest: claimDecisionRead" });
    }
  };

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

  return { ...orm, primaryNode, findByProviderRequestId, claimDecisionRead, updateWithDetails };
};
