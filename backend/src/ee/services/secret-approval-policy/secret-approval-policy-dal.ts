import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { SecretApprovalPoliciesSchema, TableName, TSecretApprovalPolicies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

export type TSecretApprovalPolicyDALFactory = ReturnType<typeof secretApprovalPolicyDALFactory>;

export const secretApprovalPolicyDALFactory = (db: TDbClient) => {
  const secretApprovalPolicyOrm = ormify(db, TableName.SecretApprovalPolicy);

  const secretApprovalPolicyFindQuery = (tx: Knex, filter: TFindFilter<TSecretApprovalPolicies>) =>
    tx(TableName.SecretApprovalPolicy)
      // eslint-disable-next-line
      .where(buildFindFilter(filter))
      .join(TableName.Environment, `${TableName.SecretApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .leftJoin(
        TableName.SecretApprovalPolicyApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyApprover}.policyId`
      )

      .leftJoin(TableName.Users, `${TableName.SecretApprovalPolicyApprover}.approverUserId`, `${TableName.Users}.id`)

      .select(
        tx.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover),
        tx.ref("email").withSchema(TableName.Users).as("approverEmail"),
        tx.ref("firstName").withSchema(TableName.Users).as("approverFirstName"),
        tx.ref("lastName").withSchema(TableName.Users).as("approverLastName")
      )
      .select(
        tx.ref("name").withSchema(TableName.Environment).as("envName"),
        tx.ref("slug").withSchema(TableName.Environment).as("envSlug"),
        tx.ref("id").withSchema(TableName.Environment).as("envId"),
        tx.ref("projectId").withSchema(TableName.Environment)
      )
      .select(selectAllTableCols(TableName.SecretApprovalPolicy))
      .orderBy("createdAt", "asc");

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await secretApprovalPolicyFindQuery(tx || db.replicaNode(), {
        [`${TableName.SecretApprovalPolicy}.id` as "id"]: id
      });
      const formatedDoc = sqlNestRelationships({
        data: doc,
        key: "id",
        parentMapper: (data) => ({
          environment: { id: data.envId, name: data.envName, slug: data.envSlug },
          projectId: data.projectId,
          ...SecretApprovalPoliciesSchema.parse(data)
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "userApprovers" as const,
            mapper: ({ approverUserId, approverEmail, approverFirstName, approverLastName }) => ({
              userId: approverUserId,
              email: approverEmail,
              firstName: approverFirstName,
              lastName: approverLastName
            })
          }
        ]
      });

      return formatedDoc?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const find = async (filter: TFindFilter<TSecretApprovalPolicies & { projectId: string }>, tx?: Knex) => {
    try {
      const docs = await secretApprovalPolicyFindQuery(tx || db.replicaNode(), filter);
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          environment: { id: data.envId, name: data.envName, slug: data.envSlug },
          projectId: data.projectId,
          ...SecretApprovalPoliciesSchema.parse(data)
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "userApprovers" as const,
            mapper: ({ approverUserId }) => ({
              userId: approverUserId
            })
          }
        ]
      });
      return formatedDoc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  return { ...secretApprovalPolicyOrm, findById, find };
};
