import z from "zod";

import { TDigitalOceanConnection, TDigitalOceanVariable } from "@app/services/app-connection/digital-ocean";

import {
  CreateDigitalOceanAppPlatformSyncSchema,
  DigitalOceanAppPlatformSyncListItemSchema,
  DigitalOceanAppPlatformSyncSchema
} from "./digital-ocean-app-platform-sync-schemas";

export type TDigitalOceanAppPlatformSyncListItem = z.infer<typeof DigitalOceanAppPlatformSyncListItemSchema>;

export type TDigitalOceanAppPlatformSync = z.infer<typeof DigitalOceanAppPlatformSyncSchema>;

export type TDigitalOceanAppPlatformSyncInput = z.infer<typeof CreateDigitalOceanAppPlatformSyncSchema>;

export type TDigitalOceanAppPlatformSyncWithCredentials = TDigitalOceanAppPlatformSync & {
  connection: TDigitalOceanConnection;
};

export type TDigitalOceanAppPlatformSecret = TDigitalOceanVariable & {
  type: "SECRET";
};
