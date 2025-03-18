import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { sqlConnectionQuery } from "@app/services/app-connection/shared/sql";

import { PostgresConnectionMethod } from "./postgres-connection-enums";
import { TPostgresConnectionConfig } from "./postgres-connection-types";

export const getPostgresConnectionListItem = () => {
  return {
    name: "PostgreSQL" as const,
    app: AppConnection.Postgres as const,
    methods: Object.values(PostgresConnectionMethod) as [PostgresConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: true as const
  };
};

export const validatePostgresConnectionCredentials = async (config: TPostgresConnectionConfig) => {
  const { credentials, isPlatformManaged } = config;

  try {
    if (isPlatformManaged) {
      const newPassword = alphaNumericNanoId(32);
      await sqlConnectionQuery({
        credentials,
        app: AppConnection.Postgres,
        query: `ALTER ROLE ?? WITH PASSWORD '${newPassword}';`,
        variables: [credentials.username]
      });

      return {
        ...credentials,
        password: newPassword
      };
    }

    await sqlConnectionQuery({
      credentials,
      app: AppConnection.Postgres,
      query: "SELECT NOW()"
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
