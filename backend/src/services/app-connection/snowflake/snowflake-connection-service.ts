import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  listSnowflakeDatabases,
  listSnowflakeSchemas,
  listSnowflakeUsers
} from "@app/services/app-connection/snowflake/snowflake-connection-fns";
import { TSnowflakeConnection } from "@app/services/app-connection/snowflake/snowflake-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TSnowflakeConnection>;

export const snowflakeConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listDatabases = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Snowflake, connectionId, actor);
    return listSnowflakeDatabases(appConnection.credentials);
  };

  const listSchemas = async (connectionId: string, database: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Snowflake, connectionId, actor);
    return listSnowflakeSchemas(appConnection.credentials, database);
  };

  const listUsers = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Snowflake, connectionId, actor);
    return listSnowflakeUsers(appConnection.credentials);
  };

  return {
    listDatabases,
    listSchemas,
    listUsers
  };
};
