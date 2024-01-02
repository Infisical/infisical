import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSarReviewerDalFactory = ReturnType<typeof sarReviewerDalFactory>;

export const sarReviewerDalFactory = (db: TDbClient) => {
  const sarReviewerOrm = ormify(db, TableName.SarReviewer);
  return sarReviewerOrm;
};
