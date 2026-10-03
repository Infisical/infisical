import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityKubernetesAuthsUpdate } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityKubernetesAuthDALFactory = ReturnType<typeof identityKubernetesAuthDALFactory>;

export const identityKubernetesAuthDALFactory = (db: TDbClient) => {
  const kubernetesAuthOrm = ormify(db, TableName.IdentityKubernetesAuth);

  // narrow returning: template propagation only needs the affected identity ids, not the
  // full rows with their encrypted credential buffers
  const updateByTemplateId = async (
    { templateId, identityIds }: { templateId: string; identityIds?: string[] },
    data: TIdentityKubernetesAuthsUpdate,
    tx?: Knex
  ): Promise<{ identityId: string }[]> => {
    const query = (tx || db)(TableName.IdentityKubernetesAuth).where({ templateId });
    if (identityIds) void query.whereIn("identityId", identityIds);
    const docs: { identityId: string }[] = await query.update(data).returning("identityId");
    return docs;
  };

  const findByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.IdentityKubernetesAuth)
      .leftJoin(TableName.Identity, `${TableName.IdentityKubernetesAuth}.identityId`, `${TableName.Identity}.id`)
      .where(`${TableName.IdentityKubernetesAuth}.gatewayV2Id`, gatewayId)
      .select(
        db.ref("id").withSchema(TableName.IdentityKubernetesAuth),
        db.ref("identityId").withSchema(TableName.IdentityKubernetesAuth),
        db.ref("name").withSchema(TableName.Identity).as("identityName")
      );

    return docs;
  };

  const countByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.IdentityKubernetesAuth)
      .where(`${TableName.IdentityKubernetesAuth}.gatewayV2Id`, gatewayId)
      .count("id")
      .first();

    return parseInt(String(result?.count || "0"), 10);
  };

  const findByGatewayPoolId = async (gatewayPoolId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.IdentityKubernetesAuth)
      .leftJoin(TableName.Identity, `${TableName.IdentityKubernetesAuth}.identityId`, `${TableName.Identity}.id`)
      .where(`${TableName.IdentityKubernetesAuth}.gatewayPoolId`, gatewayPoolId)
      .select(
        db.ref("id").withSchema(TableName.IdentityKubernetesAuth),
        db.ref("identityId").withSchema(TableName.IdentityKubernetesAuth),
        db.ref("name").withSchema(TableName.Identity).as("identityName")
      );

    return docs;
  };

  const countByGatewayPoolId = async (gatewayPoolId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.IdentityKubernetesAuth)
      .where(`${TableName.IdentityKubernetesAuth}.gatewayPoolId`, gatewayPoolId)
      .count("id")
      .first();

    return parseInt(String(result?.count || "0"), 10);
  };

  return {
    ...kubernetesAuthOrm,
    updateByTemplateId,
    findByGatewayId,
    countByGatewayId,
    findByGatewayPoolId,
    countByGatewayPoolId
  };
};
