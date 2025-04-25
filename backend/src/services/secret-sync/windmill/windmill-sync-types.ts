import { z } from "zod";

import { TWindmillConnection } from "@app/services/app-connection/windmill";

import { CreateWindmillSyncSchema, WindmillSyncListItemSchema, WindmillSyncSchema } from "./windmill-sync-schemas";

export type TWindmillSync = z.infer<typeof WindmillSyncSchema>;

export type TWindmillSyncInput = z.infer<typeof CreateWindmillSyncSchema>;

export type TWindmillSyncListItem = z.infer<typeof WindmillSyncListItemSchema>;

export type TWindmillSyncWithCredentials = TWindmillSync & {
  connection: TWindmillConnection;
};

export type TWindmillVariable = {
  path: string;
  value: string;
  is_secret: boolean;
  is_oauth: boolean;
  description: string;
};

export type TWindmillListVariablesResponse = TWindmillVariable[];

export type TWindmillListVariables = {
  accessToken: string;
  instanceUrl: string;
  path: string;
  workspace: string;
  description?: string;
};

export type TPostWindmillVariable = TWindmillListVariables & {
  value: string;
};

export type TDeleteWindmillVariable = TWindmillListVariables;
