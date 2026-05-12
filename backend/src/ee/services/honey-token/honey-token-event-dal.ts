import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type THoneyTokenEventDALFactory = ReturnType<typeof honeyTokenEventDALFactory>;

export const honeyTokenEventDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.HoneyTokenEvent);

  const countByHoneyTokenId = async (honeyTokenId: string, since?: Date) => {
    try {
      const query = db.replicaNode()(TableName.HoneyTokenEvent).where({ honeyTokenId });
      if (since) {
        void query.where("createdAt", ">", since);
      }
      const [res] = await query.count("id", { as: "count" });
      return Number(res.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountByHoneyTokenId" });
    }
  };

  const findByHoneyTokenId = async (
    honeyTokenId: string,
    { since, offset, limit }: { since?: Date; offset?: number; limit?: number }
  ) => {
    try {
      const query = db.replicaNode()(TableName.HoneyTokenEvent).where({ honeyTokenId }).orderBy("createdAt", "desc");
      if (since) {
        void query.where("createdAt", ">", since);
      }
      if (offset !== undefined) {
        void query.offset(offset);
      }
      if (limit !== undefined) {
        void query.limit(limit);
      }
      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByHoneyTokenId" });
    }
  };

  return { ...orm, countByHoneyTokenId, findByHoneyTokenId };
};
