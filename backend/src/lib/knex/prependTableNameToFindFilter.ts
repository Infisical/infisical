import { TableName } from "@app/db/schemas/models";
import { buildFindFilter } from "@app/lib/knex/index";

type TFindFilterParameters = Parameters<typeof buildFindFilter<object>>[0];

export const prependTableNameToFindFilter = (tableName: TableName, filterObj: object): TFindFilterParameters =>
  Object.fromEntries(
    Object.entries(filterObj).map(([key, value]) =>
      key.startsWith("$")
        ? [key, value ? prependTableNameToFindFilter(tableName, value as object) : value]
        : [`${tableName}.${key}`, value]
    )
  );
