import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateZabbixConnectionSchema,
  ValidateZabbixConnectionCredentialsSchema,
  ZabbixConnectionSchema
} from "./zabbix-connection-schemas";

export type TZabbixConnection = z.infer<typeof ZabbixConnectionSchema>;

export type TZabbixConnectionInput = z.infer<typeof CreateZabbixConnectionSchema> & {
  app: AppConnection.Zabbix;
};

export type TValidateZabbixConnectionCredentialsSchema = typeof ValidateZabbixConnectionCredentialsSchema;

export type TZabbixConnectionConfig = DiscriminativePick<TZabbixConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TZabbixHost = {
  hostId: string;
  host: string;
};

export type TZabbixHostListResponse = {
  jsonrpc: string;
  result: { hostid: string; host: string }[];
  error?: { message: string };
};
