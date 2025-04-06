import { NodeClickHouseClient } from "@clickhouse/client/dist/client";
import { DatabaseError } from "../errors";

// TODO: Make this strongly typed
// TODO: find a way to escape this
export const ormify = (db: NodeClickHouseClient, tableName: "audit_logs") => ({
  findById: async (id: string, tx?: NodeClickHouseClient) => {
    try {
      // const result: any = await (tx || db).query(`SELECT * FROM ${tableName} WHERE id = ${id}`);
      const result = await (tx || db).query({
        query: `SELECT * FROM ${tableName} WHERE id = ${id}`
      });

      return (await result.json()).data?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  },
  create: async (data: { [key: string]: string }, tx?: NodeClickHouseClient) => {
    try {
      const result = await (tx || db).insert({
        table: tableName,
        values: [data],
        format: "JSONEachRow"
      });

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  deleteById: async (id: string, tx?: NodeClickHouseClient) => {
    try {
      const result = await (tx || db).query({
        query: `ALTER TABLE ${tableName} DELETE WHERE id = ${id}`
      });

      return (await result.json()).data?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete" });
    }
  }
});
