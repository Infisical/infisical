import z from "zod";

import { TLaravelForgeConnection } from "@app/services/app-connection/laravel-forge";

import {
  CreateLaravelForgeSyncSchema,
  LaravelForgeSyncListItemSchema,
  LaravelForgeSyncSchema
} from "./laravel-forge-sync-schemas";

export type TLaravelForgeSyncListItem = z.infer<typeof LaravelForgeSyncListItemSchema>;

export type TLaravelForgeSync = z.infer<typeof LaravelForgeSyncSchema>;

export type TLaravelForgeSyncInput = z.infer<typeof CreateLaravelForgeSyncSchema>;

export type TLaravelForgeSyncWithCredentials = TLaravelForgeSync & {
  connection: TLaravelForgeConnection;
};

export type LaravelForgeSecret = {
  description: string;
  is_secret: boolean;
  key: string;
  source: "app" | "env";
  value: string;
};

export interface LaravelForgeApiSecret {
  id: string;
  key: string;
  value: string;
  type: string;
  target: string[];
  customEnvironmentIds?: string[];
  gitBranch?: string;
  createdAt?: number;
  updatedAt?: number;
  configurationId?: string;
  system?: boolean;
}
