import { TDbClient } from "@app/db";
import { TableName, TDelegatedApprovalRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TDelegatedApprovalRequestDALFactory = ReturnType<typeof delegatedApprovalRequestDALFactory>;

export type TDelegatedApprovalRequestWithApprovalRequest = TDelegatedApprovalRequests & {
  approvalRequestOrganizationId: string;
  approvalRequestStatus: string;
};

export const delegatedApprovalRequestDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.DelegatedApprovalRequests);

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
        .select(
          db.ref("organizationId").withSchema(TableName.ApprovalRequests).as("approvalRequestOrganizationId"),
          db.ref("status").withSchema(TableName.ApprovalRequests).as("approvalRequestStatus")
        )
        .first();
      return (row as TDelegatedApprovalRequestWithApprovalRequest | undefined) ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "DelegatedApprovalRequest: findByProviderRequestId" });
    }
  };

  return { ...orm, findByProviderRequestId };
};
