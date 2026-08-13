import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentGatewaySessionRequestDALFactory = ReturnType<typeof agentGatewaySessionRequestDALFactory>;

export const agentGatewaySessionRequestDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGatewaySessionRequest);

  // Oldest first: this is a replay, so the reader wants the order the agent made the requests in.
  const findBySessionId = async ({
    sessionId,
    limit,
    offset
  }: {
    sessionId: string;
    limit: number;
    offset: number;
  }) => {
    try {
      return await db
        .replicaNode()(TableName.AgentGatewaySessionRequest)
        .where({ sessionId })
        .orderBy("occurredAt", "asc")
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent gateway session requests" });
    }
  };

  const countBySessionId = async (sessionId: string) => {
    try {
      const [result] = await db
        .replicaNode()(TableName.AgentGatewaySessionRequest)
        .where({ sessionId })
        .count<{ count: string | number }[]>("id");
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent gateway session requests" });
    }
  };

  // Counts for many sessions at once, so a session list does not fan out into a query per row.
  const countBySessionIds = async (sessionIds: string[]): Promise<Record<string, number>> => {
    if (!sessionIds.length) return {};

    try {
      const rows = (await db
        .replicaNode()(TableName.AgentGatewaySessionRequest)
        .whereIn("sessionId", sessionIds)
        .groupBy("sessionId")
        .select("sessionId")
        .count<{ sessionId: string; count: string | number }[]>("id")) as unknown as {
        sessionId: string;
        count: string | number;
      }[];

      return rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.sessionId] = Number(row.count);
        return acc;
      }, {});
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent gateway session requests by ids" });
    }
  };

  // How many of a session's requests actually carried a credential, which is the number a reviewer looks for.
  const countBrokeredBySessionIds = async (sessionIds: string[]): Promise<Record<string, number>> => {
    if (!sessionIds.length) return {};

    try {
      const rows = (await db
        .replicaNode()(TableName.AgentGatewaySessionRequest)
        .whereIn("sessionId", sessionIds)
        .where("decision", "brokered")
        .groupBy("sessionId")
        .select("sessionId")
        .count<{ sessionId: string; count: string | number }[]>("id")) as unknown as {
        sessionId: string;
        count: string | number;
      }[];

      return rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.sessionId] = Number(row.count);
        return acc;
      }, {});
    } catch (error) {
      throw new DatabaseError({ error, name: "Count brokered agent gateway session requests" });
    }
  };

  return { ...orm, findBySessionId, countBySessionId, countBySessionIds, countBrokeredBySessionIds };
};
