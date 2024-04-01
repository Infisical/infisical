import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAccessApprovalPolicies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, mergeOneToManyRelation, ormify, selectAllTableCols, TFindFilter } from "@app/lib/knex";

export type TAccessApprovalPolicyDALFactory = ReturnType<typeof accessApprovalPolicyDALFactory>;

export const accessApprovalPolicyDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyOrm = ormify(db, TableName.AccessApprovalPolicy);

  const sapFindQuery = async (tx: Knex, filter: TFindFilter<TAccessApprovalPolicies>) => {
    const result = await tx(TableName.AccessApprovalPolicy)
      // eslint-disable-next-line
      .where(buildFindFilter(filter))
      .join(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .join(
        TableName.AccessApprovalPolicyApprover,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyApprover}.policyId`
      )
      .select(tx.ref("approverId").withSchema(TableName.AccessApprovalPolicyApprover))
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.AccessApprovalPolicy));

    return result;
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await sapFindQuery(tx || db, {
        [`${TableName.AccessApprovalPolicy}.id` as "id"]: id
      });
      const formatedDoc = mergeOneToManyRelation(
        doc,
        "id",
        ({ approverId, envId, envName: name, envSlug: slug, ...el }) => ({
          ...el,
          envId,
          environment: { id: envId, name, slug }
        }),
        ({ approverId }) => approverId,
        "approvers"
      );
      return formatedDoc?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const find = async (filter: TFindFilter<TAccessApprovalPolicies & { projectId: string }>, tx?: Knex) => {
    try {
      const docs = await sapFindQuery(tx || db, filter);
      const formatedDoc = mergeOneToManyRelation(
        docs,
        "id",
        ({ approverId, envId, envName: name, envSlug: slug, ...el }) => ({
          ...el,
          envId,
          environment: { id: envId, name, slug }
        }),
        ({ approverId }) => approverId,
        "approvers"
      );
      return formatedDoc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  return { ...accessApprovalPolicyOrm, find, findById };
};
