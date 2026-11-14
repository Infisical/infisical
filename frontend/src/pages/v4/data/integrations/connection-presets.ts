import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AzureKeyVaultConnectionMethod } from "@app/hooks/api/appConnections/types/azure-key-vault-connection";
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
  [AppConnection.Jenkins]: "optional",
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

/** Methods whose connection only works after a step that follows create, which only the add sheet has. */
const POST_CREATE_STEP_METHODS = new Set<string>([AzureKeyVaultConnectionMethod.ManagedIdentity]);

/** Presets for flows that create a connection inline and select it, so without a follow-up step. */
export const INLINE_CONNECTION_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> =
  Object.fromEntries(
    Object.entries(CONNECTION_PRESETS).map(([app, preset]) => [
      app,
      {
        ...preset,
        methods: preset.methods.filter((entry) => !POST_CREATE_STEP_METHODS.has(entry.value))
      }
    ])
  );
