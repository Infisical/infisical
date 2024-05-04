import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretApprovalPolicies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, mergeOneToManyRelation, ormify, selectAllTableCols, TFindFilter } from "@app/lib/knex";

export type TSecretApprovalPolicyDALFactory = ReturnType<typeof secretApprovalPolicyDALFactory>;

export const secretApprovalPolicyDALFactory = (db: TDbClient) => {
  const secretApprovalPolicyOrm = ormify(db, TableName.SecretApprovalPolicy);

  const sapFindQuery = (tx: Knex, filter: TFindFilter<TSecretApprovalPolicies>) =>
    tx(TableName.SecretApprovalPolicy)
      // eslint-disable-next-line
      .where(buildFindFilter(filter))
      .join(TableName.Environment, `${TableName.SecretApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .join(
        TableName.SecretApprovalPolicyApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyApprover}.policyId`
      )
      .select(tx.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover))
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.SecretApprovalPolicy))
      .orderBy("createdAt", "asc");

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await sapFindQuery(tx || db, {
        [`${TableName.SecretApprovalPolicy}.id` as "id"]: id
      });
      const formattedDoc = mergeOneToManyRelation(
        doc,
        "id",
        ({ approverUserId, envId, envName: name, envSlug: slug, ...el }) => ({
          ...el,
          envId,
          environment: { id: envId, name, slug }
        }),
        ({ approverUserId }) => approverUserId,
        "approvers"
      );
      return formattedDoc?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const find = async (filter: TFindFilter<TSecretApprovalPolicies & { projectId: string }>, tx?: Knex) => {
    try {
      const docs = await sapFindQuery(tx || db, filter);
      const formattedDoc = mergeOneToManyRelation(
        docs,
        "id",
        ({ approverUserId, envId, envName: name, envSlug: slug, ...el }) => ({
          ...el,
          envId,
          environment: { id: envId, name, slug }
        }),
        ({ approverUserId }) => approverUserId,
        "approvers"
      );
      return formattedDoc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  const findByProjectIds = async (projectIds: string[], tx?: Knex) => {
    const policies = await (tx || db)(TableName.SecretApprovalPolicy)
      .join(TableName.Environment, `${TableName.SecretApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .whereIn(`${TableName.Environment}.projectId`, projectIds)
      .select(selectAllTableCols(TableName.SecretApprovalPolicy));

    return policies;
  };

  return { ...secretApprovalPolicyOrm, findById, find, findByProjectIds };
};
