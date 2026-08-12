import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentPolicyDALFactory = ReturnType<typeof agentPolicyDALFactory>;

export const agentPolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentPolicy);

  // Resolves the policies naming a given agent in a project, with their rules and credential
  // references. This is the read the proxy's policy fetch is built on, so it is one round trip.
  const findByAgent = async (projectId: string, identityId: string) => {
    try {
      const policies = await db
        .replicaNode()(TableName.AgentPolicy)
        .join(TableName.AgentPolicyAgent, `${TableName.AgentPolicyAgent}.policyId`, `${TableName.AgentPolicy}.id`)
        .where(`${TableName.AgentPolicy}.projectId`, projectId)
        .where(`${TableName.AgentPolicyAgent}.identityId`, identityId)
        .select(selectAllTableCols(TableName.AgentPolicy));

      return policies;
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.AgentPolicy}: FindByAgent` });
    }
  };

  return { ...orm, findByAgent };
};
