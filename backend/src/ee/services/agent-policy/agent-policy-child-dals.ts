import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentPolicyAgentDALFactory = ReturnType<typeof agentPolicyAgentDALFactory>;

export const agentPolicyAgentDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentPolicyAgent);

  // Joined to identities so a policy row can be rendered with agent names, not bare ids.
  const findByPolicyIds = async (policyIds: string[]) => {
    if (!policyIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.AgentPolicyAgent)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.AgentPolicyAgent}.identityId`)
        .whereIn(`${TableName.AgentPolicyAgent}.policyId`, policyIds)
        .select(selectAllTableCols(TableName.AgentPolicyAgent))
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.AgentPolicyAgent}: FindByPolicyIds` });
    }
  };

  return { ...orm, findByPolicyIds };
};

export type TAgentPolicyRuleDALFactory = ReturnType<typeof agentPolicyRuleDALFactory>;

export const agentPolicyRuleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentPolicyRule);

  const findByPolicyIds = async (policyIds: string[]) => {
    if (!policyIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.AgentPolicyRule)
        .whereIn("policyId", policyIds)
        .select(selectAllTableCols(TableName.AgentPolicyRule))
        .orderBy("createdAt", "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.AgentPolicyRule}: FindByPolicyIds` });
    }
  };

  return { ...orm, findByPolicyIds };
};

export type TAgentPolicyCredentialDALFactory = ReturnType<typeof agentPolicyCredentialDALFactory>;

export const agentPolicyCredentialDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentPolicyCredential);

  // Joined to the environment so callers get the env slug without a second lookup: the row stores
  // envId (a rename-safe reference) but every consumer wants the slug.
  const findByPolicyIds = async (policyIds: string[]) => {
    if (!policyIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.AgentPolicyCredential)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.AgentPolicyCredential}.envId`)
        .whereIn(`${TableName.AgentPolicyCredential}.policyId`, policyIds)
        .select(selectAllTableCols(TableName.AgentPolicyCredential))
        .select(db.ref("slug").withSchema(TableName.Environment).as("environment"));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.AgentPolicyCredential}: FindByPolicyIds` });
    }
  };

  return { ...orm, findByPolicyIds };
};
