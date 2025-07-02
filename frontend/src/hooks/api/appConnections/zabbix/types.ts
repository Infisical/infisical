export type TZabbixHost = {
  host: string;
  hostId: string;
};

export enum ZabbixSyncScope {
  Host = "host",
  Global = "global"
}

export enum ZabbixMacroType {
  Text = 0,
  Secret = 1
}

export const ZABBIX_SYNC_SCOPES = {
  [ZabbixSyncScope.Host]: {
    name: "Host",
    description: "Sync secrets to a specific host in Zabbix."
  },
  [ZabbixSyncScope.Global]: {
    name: "Global",
    description: "Sync secrets to a global scope in Zabbix."
  }
};
