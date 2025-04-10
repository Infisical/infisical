import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PostgresConnectionMethod } from "./postgres-connection-enums";

export const getPostgresConnectionListItem = () => {
  return {
    name: "PostgreSQL" as const,
    app: AppConnection.Postgres as const,
    methods: Object.values(PostgresConnectionMethod) as [PostgresConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: true as const
  };
};
