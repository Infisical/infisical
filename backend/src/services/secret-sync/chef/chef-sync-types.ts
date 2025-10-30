import z from "zod";

import { TChefConnection } from "@app/services/app-connection/chef";

import { ChefSyncListItemSchema, ChefSyncSchema, CreateChefSyncSchema } from "./chef-sync-schemas";

export type TChefSyncListItem = z.infer<typeof ChefSyncListItemSchema>;

export type TChefSync = z.infer<typeof ChefSyncSchema>;

export type TChefSyncInput = z.infer<typeof CreateChefSyncSchema>;

export type TChefSyncWithCredentials = TChefSync & {
  connection: TChefConnection;
};

export type TGetChefSecrets = {
  serverUrl?: string;
  userName: string;
  privateKey: string;
  orgName: string;
  dataBagName: string;
  dataBagItemName: string;
};

export type TChefSecret = string | number | boolean | null;

export type TChefDataBagItemContent = {
  id: string;
  [key: string]: TChefSecret;
};

export type TChefSecrets = {
  id: string;
  secrets: ChefSecret[];
};

export type ChefSecret = {
  key: string;
  value: string;
};
