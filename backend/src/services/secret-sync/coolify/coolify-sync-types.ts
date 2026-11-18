import z from "zod";

import { TCoolifyConnection } from "@app/services/app-connection/coolify";

import { CoolifySyncListItemSchema, CoolifySyncSchema, CreateCoolifySyncSchema } from "./coolify-sync-schemas";

export type TCoolifySyncListItem = z.infer<typeof CoolifySyncListItemSchema>;

export type TCoolifySync = z.infer<typeof CoolifySyncSchema>;

export type TCoolifySyncInput = z.infer<typeof CreateCoolifySyncSchema>;

export type TCoolifySyncWithCredentials = TCoolifySync & {
  connection: TCoolifyConnection;
};

// `value` is left out unless the token can read sensitive data, and always for a locked variable
export type TCoolifyEnvVar = {
  uuid: string;
  key: string;
  value?: string | null;
  is_preview?: boolean;
  is_literal?: boolean;
};

export type TCoolifyEnvVarUpsert = {
  key: string;
  value: string;
  is_literal: true;
  is_preview?: true;
};
