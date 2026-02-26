import { TDbClient } from "@app/db";
import { TableName, TNhiPolicies, TNhiPolicyExecutions } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export const nhiPolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NhiPolicy);

  const findEnabledByProjectId = async (projectId: string): Promise<TNhiPolicies[]> => {
    return db
      .replicaNode()(TableName.NhiPolicy)
      .where({ projectId, isEnabled: true })
      .orderBy("createdAt", "asc") as Promise<TNhiPolicies[]>;
  };

  return { ...orm, findEnabledByProjectId };
};

export const nhiPolicyExecutionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NhiPolicyExecution);

  const findByPolicyId = async (policyId: string): Promise<TNhiPolicyExecutions[]> => {
    return db.replicaNode()(TableName.NhiPolicyExecution).where({ policyId }).orderBy("createdAt", "desc") as Promise<
      TNhiPolicyExecutions[]
    >;
  };

  const findByScanId = async (scanId: string): Promise<TNhiPolicyExecutions[]> => {
    return db.replicaNode()(TableName.NhiPolicyExecution).where({ scanId }).orderBy("createdAt", "desc") as Promise<
      TNhiPolicyExecutions[]
    >;
  };

  const findByProjectIdWithDetails = async (projectId: string, limit = 20) => {
    return db
      .replicaNode()(TableName.NhiPolicyExecution)
      .leftJoin(TableName.NhiPolicy, `${TableName.NhiPolicyExecution}.policyId`, `${TableName.NhiPolicy}.id`)
      .leftJoin(TableName.NhiIdentity, `${TableName.NhiPolicyExecution}.identityId`, `${TableName.NhiIdentity}.id`)
      .where(`${TableName.NhiPolicyExecution}.projectId`, projectId)
      .select(
        `${TableName.NhiPolicyExecution}.*`,
        db.ref("name").withSchema(TableName.NhiPolicy).as("policyName"),
        db.ref("name").withSchema(TableName.NhiIdentity).as("identityName")
      )
      .orderBy(`${TableName.NhiPolicyExecution}.createdAt`, "desc")
      .limit(limit);
  };

  return { ...orm, findByPolicyId, findByScanId, findByProjectIdWithDetails };
};

export type TNhiPolicyDALFactory = ReturnType<typeof nhiPolicyDALFactory>;
export type TNhiPolicyExecutionDALFactory = ReturnType<typeof nhiPolicyExecutionDALFactory>;
