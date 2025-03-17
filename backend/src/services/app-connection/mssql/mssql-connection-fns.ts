import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { sqlConnectionQuery } from "@app/services/app-connection/shared/sql";

import { MsSqlConnectionMethod } from "./mssql-connection-enums";
import { TMsSqlConnectionConfig } from "./mssql-connection-types";

export const getMsSqlConnectionListItem = () => {
  return {
    name: "Microsoft SQL Server" as const,
    app: AppConnection.MsSql as const,
    methods: Object.values(MsSqlConnectionMethod) as [MsSqlConnectionMethod.UsernameAndPassword]
  };
};

export const validateMsSqlConnectionCredentials = async (config: TMsSqlConnectionConfig) => {
  const { credentials } = config;

  try {
    const queryResults = await sqlConnectionQuery({
      credentials,
      app: AppConnection.MsSql,
      query: "SELECT GETDATE()"
    });

    logger.warn(queryResults, "QUERY RESULTS");
  } catch (e) {
    console.error(e);
    throw new BadRequestError({ message: "Unable to validate connection - verify credentials" });
  }

  return credentials;
};
