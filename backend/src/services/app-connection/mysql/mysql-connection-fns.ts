import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { MySqlConnectionMethod } from "./mysql-connection-enums";

export const getMySqlConnectionListItem = () => {
  return {
    name: "MySQL" as const,
    app: AppConnection.MySql as const,
    methods: Object.values(MySqlConnectionMethod) as [MySqlConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: true as const
  };
};
