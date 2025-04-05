import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { MsSqlConnectionMethod } from "./mssql-connection-enums";

export const getMsSqlConnectionListItem = () => {
  return {
    name: "Microsoft SQL Server" as const,
    app: AppConnection.MsSql as const,
    methods: Object.values(MsSqlConnectionMethod) as [MsSqlConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: true as const
  };
};
