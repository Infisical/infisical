import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OracleDBConnectionMethod } from "./oracledb-connection-enums";

export const getOracleDBConnectionListItem = () => {
  return {
    name: "OracleDB" as const,
    app: AppConnection.OracleDB as const,
    methods: Object.values(OracleDBConnectionMethod) as [OracleDBConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: true as const
  };
};
