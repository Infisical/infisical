import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { sqlConnectionQuery } from "@app/services/app-connection/shared/sql";

import { MsSqlConnectionMethod } from "./mssql-connection-enums";
import { TMsSqlConnectionConfig } from "./mssql-connection-types";

export const getMsSqlConnectionListItem = () => {
  return {
    name: "Microsoft SQL Server" as const,
    app: AppConnection.MsSql as const,
    methods: Object.values(MsSqlConnectionMethod) as [MsSqlConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: true as const
  };
};

export const validateMsSqlConnectionCredentials = async (config: TMsSqlConnectionConfig) => {
  const { credentials, isPlatformManaged } = config;

  try {
    if (isPlatformManaged) {
      const newPassword = alphaNumericNanoId(32);
      await sqlConnectionQuery({
        credentials,
        app: AppConnection.MsSql,
        query: `ALTER LOGIN ?? WITH PASSWORD = '${newPassword}' OLD_PASSWORD = '${credentials.password}';`,
        variables: [credentials.username]
      });

      return {
        ...credentials,
        password: newPassword
      };
    }

    await sqlConnectionQuery({
      credentials,
      app: AppConnection.MsSql,
      query: "SELECT GETDATE()"
    });

    return credentials;
  } catch (e) {
    logger.error(e);

    if ((e as { number: number }).number === 15151) {
      throw new BadRequestError({
        message: `Cannot alter the login '${credentials.username}', because it does not exist or you do not have permission.`
      });
    }

    throw new BadRequestError({ message: "Unable to validate connection - verify credentials" });
  }
};
