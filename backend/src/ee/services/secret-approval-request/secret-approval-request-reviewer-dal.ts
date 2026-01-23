import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSecretApprovalRequestReviewerDALFactory = ReturnType<typeof secretApprovalRequestReviewerDALFactory>;

export const secretApprovalRequestReviewerDALFactory = (db: TDbClient) => {
  const secretApprovalRequestReviewerOrm = ormify(db, TableName.SecretApprovalRequestReviewer);
  return secretApprovalRequestReviewerOrm;
};
