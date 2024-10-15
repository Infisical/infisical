import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import { Knex } from "knex";

export type TConsumerSecretDALFactory = ReturnType<typeof createConsumerSecretDAL>;

export const createConsumerSecretDAL = (db: TDbClient) => {
  const consumerSecretOrm = ormify(db, TableName.ConsumerSecret);

  interface ConsumerSecretsCountResult {
    count: string;
  }

  const getConsumerSecretCount = async ({ orgId, tx }: { orgId: string; tx?: Knex }) => {
    try {
        const consumerSecretsCountResult = await (tx || db.replicaNode())(TableName.ConsumerSecret)
            .where(`${TableName.ConsumerSecret}.orgId`, orgId)
            .count("* as count")
            .first<ConsumerSecretsCountResult>();

        // Safely parse the count, returning 0 if undefined
        const count = consumerSecretsCountResult?.count ? parseInt(consumerSecretsCountResult.count, 10) : 0;
        return count;
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
