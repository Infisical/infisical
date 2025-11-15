import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export type TPamMcpDALFactory = ReturnType<typeof pamMcpDALFactory>;

export const pamMcpDALFactory = (db: TDbClient) => {

  return {  };
};
