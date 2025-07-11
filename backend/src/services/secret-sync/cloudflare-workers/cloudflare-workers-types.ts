import z from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflareWorkersSyncListItemSchema,
  CloudflareWorkersSyncSchema,
  CreateCloudflareWorkersSyncSchema
} from "./cloudflare-workers-schemas";

export type TCloudflareWorkersSyncListItem = z.infer<typeof CloudflareWorkersSyncListItemSchema>;

export type TCloudflareWorkersSync = z.infer<typeof CloudflareWorkersSyncSchema>;

export type TCloudflareWorkersSyncInput = z.infer<typeof CreateCloudflareWorkersSyncSchema>;

export type TCloudflareWorkersSyncWithCredentials = TCloudflareWorkersSync & {
  connection: TCloudflareConnection;
};
