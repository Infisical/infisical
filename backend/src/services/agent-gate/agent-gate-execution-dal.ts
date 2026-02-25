import { TDbClient } from "@app/db";
import { TableName, TAgentGateExecutions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentGateExecutionDALFactory = ReturnType<typeof agentGateExecutionDALFactory>;

export const agentGateExecutionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGateExecutions);

  const findByExecutionId = async (executionId: string): Promise<TAgentGateExecutions | undefined> => {
    try {
      const execution = await db.replicaNode()(TableName.AgentGateExecutions).where({ executionId }).first();
      return execution;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExecutionById" });
    }
  };

  const createExecution = async (data: {
    executionId: string;
    sessionId?: string;
    projectId: string;
    requestingAgentId: string;
    targetAgentId: string;
    actionType: "skill" | "communication";
    action: string;
    parameters?: Record<string, unknown>;
    context?: Record<string, unknown>;
    startedAt: Date;
  }): Promise<TAgentGateExecutions> => {
    try {
      const [created] = await db(TableName.AgentGateExecutions)
        .insert({
          ...data,
          status: "started",
          parameters: data.parameters ? JSON.stringify(data.parameters) : undefined,
          context: data.context ? JSON.stringify(data.context) : undefined
        })
        .returning("*");
      return created;
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateExecution" });
    }
  };

  const completeExecution = async (
    executionId: string,
    data: {
      status: "completed" | "failed";
      completedAt: Date;
      durationMs: number;
      result?: Record<string, unknown>;
      error?: string;
    }
  ): Promise<TAgentGateExecutions | undefined> => {
    try {
      const [updated] = await db(TableName.AgentGateExecutions)
        .where({ executionId })
        .update({
          ...data,
          result: data.result ? JSON.stringify(data.result) : undefined,
          updatedAt: new Date()
        })
        .returning("*");
      return updated;
    } catch (error) {
      throw new DatabaseError({ error, name: "CompleteExecution" });
    }
  };

  const findByProjectAndAgent = async (
    projectId: string,
    agentId?: string,
    limit = 100,
    offset = 0
  ): Promise<TAgentGateExecutions[]> => {
    try {
      let query = db
        .replicaNode()(TableName.AgentGateExecutions)
        .where({ projectId })
        .orderBy("createdAt", "desc")
        .limit(limit)
        .offset(offset);

      if (agentId) {
        query = query.andWhere(function () {
          this.where({ requestingAgentId: agentId }).orWhere({ targetAgentId: agentId });
        });
      }

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExecutionsByProjectAndAgent" });
    }
  };

  return {
    ...orm,
    findByExecutionId,
    createExecution,
    completeExecution,
    findByProjectAndAgent
  };
};
