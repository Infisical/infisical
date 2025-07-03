import { z } from "zod";

import { TZabbixConnection } from "@app/services/app-connection/zabbix";

import { CreateZabbixSyncSchema, ZabbixSyncListItemSchema, ZabbixSyncSchema } from "./zabbix-sync-schemas";

export type TZabbixSync = z.infer<typeof ZabbixSyncSchema>;
export type TZabbixSyncInput = z.infer<typeof CreateZabbixSyncSchema>;
export type TZabbixSyncListItem = z.infer<typeof ZabbixSyncListItemSchema>;

export type TZabbixSyncWithCredentials = TZabbixSync & {
  connection: TZabbixConnection;
};

export type TZabbixSecret = {
  macro: string;
  value: string;
  description?: string;
  globalmacroid?: string;
  hostmacroid?: string;
  hostid?: string;
  type: number;
  automatic?: string;
};

export interface ZabbixApiResponse<T = unknown> {
  data: {
    jsonrpc: "2.0";
    result?: T;
    error?: {
      code: number;
      message: string;
      data?: string;
    };
    id: number;
  };
}

export interface ZabbixMacroCreateResponse {
  hostmacroids?: string[];
  globalmacroids?: string[];
}

export interface ZabbixMacroUpdateResponse {
  hostmacroids?: string[];
  globalmacroids?: string[];
}

export interface ZabbixMacroDeleteResponse {
  hostmacroids?: string[];
  globalmacroids?: string[];
}

export enum ZabbixMacroType {
  TEXT = 0,
  SECRET = 1
}

export interface ZabbixMacroInput {
  hostid?: string;
  macro: string;
  value: string;
  description?: string;
  type?: ZabbixMacroType;
  automatic?: "0" | "1";
}

export interface ZabbixMacroUpdate {
  hostmacroid?: string;
  globalmacroid?: string;
  value?: string;
  description?: string;
  type?: ZabbixMacroType;
  automatic?: "0" | "1";
}
