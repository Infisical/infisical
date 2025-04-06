import { createClient } from "@clickhouse/client";
import { NodeClickHouseClient } from "@clickhouse/client/dist/client";

export const initAuditLogDbConnection = ({
  dbConnectionUri,
  dbConnectionUser,
  dbConnectionPassword
}: {
  dbConnectionUri: string;
  dbConnectionUser: string;
  dbConnectionPassword: string;
}): NodeClickHouseClient => {
  const db = createClient({
    url: dbConnectionUri,
    username: dbConnectionUser,
    password: dbConnectionPassword
  });
  return db;
};
