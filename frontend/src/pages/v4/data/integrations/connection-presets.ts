import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { AppConnectionPreset } from "@app/pages/v4/components/app-connection-form";

import { CLOUD_PRESETS } from "./presets/cloud";
import { CORE_PRESETS } from "./presets/core";
import { DATABASE_PRESETS } from "./presets/databases";
import { DEPLOY_PRESETS } from "./presets/deploy";
import { INFRASTRUCTURE_PRESETS } from "./presets/infrastructure";
import { SERVICE_PRESETS } from "./presets/services";

export const CONNECTION_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  ...CORE_PRESETS,
  ...CLOUD_PRESETS,
  ...DATABASE_PRESETS,
  ...INFRASTRUCTURE_PRESETS,
  ...DEPLOY_PRESETS,
  ...SERVICE_PRESETS
};

/** Apps whose v3 form offers a gateway, and whether the app can only be reached through one. */
export const CONNECTION_GATEWAYS: Partial<Record<AppConnection, "optional" | "required">> = {
  [AppConnection.ADCS]: "required",
  [AppConnection.AzureKeyVault]: "optional",
  [AppConnection.Chef]: "optional",
  [AppConnection.ClickHouse]: "optional",
  [AppConnection.Databricks]: "optional",
  [AppConnection.F5BigIp]: "optional",
  [AppConnection.GitHub]: "optional",
  [AppConnection.HCVault]: "optional",
  [AppConnection.HpeIloRedFish]: "optional",
  [AppConnection.Imperva]: "optional",
  [AppConnection.Jira]: "optional",
  [AppConnection.KempLoadMaster]: "optional",
  [AppConnection.LDAP]: "optional",
  [AppConnection.MsSql]: "optional",
  [AppConnection.MySql]: "optional",
  [AppConnection.NetScaler]: "optional",
  [AppConnection.NutanixPrismCentral]: "optional",
  [AppConnection.OracleDB]: "optional",
  [AppConnection.PaloAltoNetworks]: "optional",
  [AppConnection.Portainer]: "optional",
  [AppConnection.Postgres]: "optional",
  [AppConnection.PowerDns]: "optional",
  [AppConnection.SMB]: "optional",
  [AppConnection.SSH]: "optional",
  [AppConnection.VenafiTpp]: "optional",
  [AppConnection.WinRM]: "required"
};
