import { TDbClient } from "@app/db";
import { TableName, TAgentGatePolicies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentGatePolicyDALFactory = ReturnType<typeof agentGatePolicyDALFactory>;

export const agentGatePolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGatePolicies);

  const findByProjectAndAgentId = async (
    projectId: string,
    agentId: string
  ): Promise<TAgentGatePolicies | undefined> => {
    try {
      const policy = await db.replicaNode()(TableName.AgentGatePolicies).where({ projectId, agentId }).first();
      return policy;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPolicyByProjectAndAgentId" });
    }
  };

  const findAllByProject = async (projectId: string): Promise<TAgentGatePolicies[]> => {
    try {
      const policies = await db.replicaNode()(TableName.AgentGatePolicies).where({ projectId });
      return policies;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindAllPoliciesByProject" });
    }
  };

  const upsertPolicy = async (
    projectId: string,
    agentId: string,
    data: Partial<TAgentGatePolicies>
  ): Promise<TAgentGatePolicies> => {
    try {
      const existing = await findByProjectAndAgentId(projectId, agentId);
      if (existing) {
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (data.selfPolicies !== undefined) {
          updateData.selfPolicies = JSON.stringify(data.selfPolicies);
        }
        if (data.inboundPolicies !== undefined) {
          updateData.inboundPolicies = JSON.stringify(data.inboundPolicies);
        }
        const [updated] = await db(TableName.AgentGatePolicies)
          .where({ projectId, agentId })
          .update(updateData)
          .returning("*");
        return updated;
      }
      const [created] = await db(TableName.AgentGatePolicies)
        .insert({
          projectId,
          agentId,
          selfPolicies: JSON.stringify(data.selfPolicies || { allowedActions: [], promptPolicies: [] }),
          inboundPolicies: JSON.stringify(data.inboundPolicies || [])
        })
        .returning("*");
      return created;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpsertPolicy" });
    }
  };

  return {
    ...orm,
    findByProjectAndAgentId,
    findAllByProject,
    upsertPolicy
  };
};
