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

export type TGetLaravelForgeSecrets = {
  apiToken: string;
  orgSlug: string;
  serverId: number;
  siteId: string;
};

export type TLaravelForgeSecrets = {
  data: {
    id: string;
    type: string;
    attributes: {
      content: string;
    };
  };
};

export type LaravelForgeSecret = {
  key: string;
  value: string;
};
