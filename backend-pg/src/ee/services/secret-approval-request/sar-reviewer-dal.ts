import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSarReviewerDALFactory = ReturnType<typeof sarReviewerDALFactory>;

export const sarReviewerDALFactory = (db: TDbClient) => {
  const sarReviewerOrm = ormify(db, TableName.SarReviewer);
  return sarReviewerOrm;
};
