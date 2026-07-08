import z from "zod";

import { THasuraCloudConnection } from "@app/services/app-connection/hasura-cloud";

import {
  CreateHasuraCloudSyncSchema,
  HasuraCloudSyncListItemSchema,
  HasuraCloudSyncSchema
} from "./hasura-cloud-sync-schemas";

export type THasuraCloudSyncListItem = z.infer<typeof HasuraCloudSyncListItemSchema>;

export type THasuraCloudSync = z.infer<typeof HasuraCloudSyncSchema>;

export type THasuraCloudSyncInput = z.infer<typeof CreateHasuraCloudSyncSchema>;

export type THasuraCloudSyncWithCredentials = THasuraCloudSync & {
  connection: THasuraCloudConnection;
};
