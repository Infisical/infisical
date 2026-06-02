import { AppConnection } from "../app-connection/app-connection-enums";

export const EXTERNAL_MIGRATION_APP_CONNECTIONS: readonly AppConnection[] = [
  AppConnection.HCVault,
  AppConnection.Doppler
] as const;
