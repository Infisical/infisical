import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityKubernetesAuthDALFactory = ReturnType<typeof identityKubernetesAuthDALFactory>;

export const identityKubernetesAuthDALFactory = (db: TDbClient) => {
  const kubernetesAuthOrm = ormify(db, TableName.IdentityKubernetesAuth);

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

  return { ...kubernetesAuthOrm, findByGatewayId, countByGatewayId, findByGatewayPoolId, countByGatewayPoolId };
};
