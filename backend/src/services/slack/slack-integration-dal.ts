import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSlackIntegrationDALFactory = ReturnType<typeof slackIntegrationDALFactory>;

export const slackIntegrationDALFactory = (db: TDbClient) => {
  const slackIntegrationOrm = ormify(db, TableName.SlackIntegrations);

  return slackIntegrationOrm;
};
