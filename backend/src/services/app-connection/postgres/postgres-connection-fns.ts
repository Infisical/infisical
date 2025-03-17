import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { sqlConnectionQuery } from "@app/services/app-connection/shared/sql";

import { PostgresConnectionMethod } from "./postgres-connection-enums";
import { TPostgresConnectionConfig } from "./postgres-connection-types";

export const getPostgresConnectionListItem = () => {
  return {
    name: "PostgreSQL" as const,
    app: AppConnection.Postgres as const,
    methods: Object.values(PostgresConnectionMethod) as [PostgresConnectionMethod.UsernameAndPassword]
  };
};

export const validatePostgresConnectionCredentials = async (config: TPostgresConnectionConfig) => {
  const { credentials } = config;

  try {
    const queryResults = await sqlConnectionQuery({
      credentials,
      app: AppConnection.Postgres,
      query: "SELECT NOW()"
    });

    logger.warn(queryResults, "QUERY RESULTS");
  } catch (e) {
    throw new BadRequestError({ message: "Unable to validate connection - verify credentials" });
  }

  return credentials;
};
