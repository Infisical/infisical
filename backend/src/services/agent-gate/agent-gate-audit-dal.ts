import { TDbClient } from "@app/db";
import { TableName, TAgentGateAuditLogs, TPolicyEvaluationResult } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentGateAuditDALFactory = ReturnType<typeof agentGateAuditDALFactory>;

export const agentGateAuditDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGateAuditLogs);

  const createAuditLog = async (data: {
    sessionId?: string;
    projectId: string;
    timestamp: Date;
    requestingAgentId: string;
    targetAgentId: string;
    actionType: "skill" | "communication";
    action: string;
    result: "allowed" | "denied";
    policyEvaluations: TPolicyEvaluationResult[];
    context?: Record<string, unknown>;
  }): Promise<TAgentGateAuditLogs> => {
    try {
      const [created] = await db(TableName.AgentGateAuditLogs)
        .insert({
          ...data,
          policyEvaluations: JSON.stringify(data.policyEvaluations),
          context: data.context ? JSON.stringify(data.context) : undefined
        })
        .returning("*");
      return created;
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateAuditLog" });
    }
  };

  const findByProject = async (
    projectId: string,
    filters?: {
      sessionId?: string;
      agentId?: string;
      action?: string;
      result?: "allowed" | "denied";
      startTime?: Date;
      endTime?: Date;
    },
    limit = 100,
    offset = 0
  ): Promise<TAgentGateAuditLogs[]> => {
    try {
      let query = db
        .replicaNode()(TableName.AgentGateAuditLogs)
        .where({ projectId })
        .orderBy("timestamp", "desc")
        .limit(limit)
        .offset(offset);

      if (filters?.sessionId) {
        query = query.andWhere({ sessionId: filters.sessionId });
      }

      if (filters?.agentId) {
        query = query.andWhere(function () {
          this.where({ requestingAgentId: filters.agentId }).orWhere({ targetAgentId: filters.agentId });
        });
      }

      if (filters?.action) {
        query = query.andWhere({ action: filters.action });
      }

      if (filters?.result) {
        query = query.andWhere({ result: filters.result });
      }

      if (filters?.startTime) {
        query = query.andWhere("timestamp", ">=", filters.startTime);
      }

      if (filters?.endTime) {
        query = query.andWhere("timestamp", "<=", filters.endTime);
      }

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindAuditLogsByProject" });
    }
  };

  return {
    ...orm,
    createAuditLog,
    findByProject
  };
};
