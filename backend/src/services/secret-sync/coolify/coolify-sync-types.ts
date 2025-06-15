import z from "zod";

import { TCoolifyConnection } from "@app/services/app-connection/coolify";

import { CoolifySyncListItemSchema, CoolifySyncSchema, CreateCoolifySyncSchema } from "./coolify-sync-schemas";

export type TCoolifySync = z.infer<typeof CoolifySyncSchema>;

export type TCoolifySyncInput = z.infer<typeof CreateCoolifySyncSchema>;

export type TCoolifySyncListItem = z.infer<typeof CoolifySyncListItemSchema>;

export type TCoolifySyncWithCredentials = TCoolifySync & {
  connection: TCoolifyConnection;
};

export type TCoolifySecret = {
  id: number;
  uuid: string;
  key: string;
  real_value: string;
  value: string;
  is_build_time: boolean;
  is_literal: boolean;
  is_multiline: boolean;
  is_preview: boolean;
};

export type TCoolifyNewSecret = Omit<TCoolifySecret, "id" | "uuid" | "real_value" | "is_multiline">;

export type TCoolifyAPIResponse = {
  message: string;
};

export type TCoolifyAPICreateEnvResponse = {
  uuid: string;
};
