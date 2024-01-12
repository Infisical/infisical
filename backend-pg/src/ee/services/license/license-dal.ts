import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export type TLicenseDalFactory = ReturnType<typeof licenseDalFactory>;

export const licenseDalFactory = (db: TDbClient) => ({  });
