import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import { Knex } from "knex";

export type TConsumerSecretDALFactory = ReturnType<typeof createConsumerSecretDAL>;

export const createConsumerSecretDAL = (db: TDbClient) => {
  const consumerSecretOrm = ormify(db, TableName.ConsumerSecret);

  const getConsumerSecretCount = async ({ orgId, tx }: { orgId: string,  tx?: Knex }) => {
    try {
        const consumerSecretsCount = await (tx || db.replicaNode())(TableName.ConsumerSecret)
        .where(`${TableName.ConsumerSecret}.orgId`, orgId)
        .count("*")
        .first();
      
      return consumerSecretsCount ? parseInt(consumerSecretsCount, 10) : "";
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Failed to count user secrets for the organization"
      });
    }
  };

  return {
    ...consumerSecretOrm,
    getConsumerSecretCount,
  };
};
