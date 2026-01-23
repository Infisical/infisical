import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TAccessApprovalRequestReviewerDALFactory = TOrmify<TableName.AccessApprovalRequestReviewer>;

export const accessApprovalRequestReviewerDALFactory = (db: TDbClient): TAccessApprovalRequestReviewerDALFactory => {
  const secretApprovalRequestReviewerOrm = ormify(db, TableName.AccessApprovalRequestReviewer);
  return secretApprovalRequestReviewerOrm;
};
