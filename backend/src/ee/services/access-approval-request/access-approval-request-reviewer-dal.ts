import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAccessApprovalRequestReviewerDALFactory = ReturnType<typeof accessApprovalRequestReviewerDALFactory>;

export const accessApprovalRequestReviewerDALFactory = (db: TDbClient) => {
  const secretApprovalRequestReviewerOrm = ormify(db, TableName.AccessApprovalRequestReviewer);
  return secretApprovalRequestReviewerOrm;
};
