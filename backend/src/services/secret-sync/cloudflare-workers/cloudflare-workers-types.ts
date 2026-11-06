import z from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflareWorkersSyncListItemSchema,
  CloudflareWorkersSyncSchema,
  CreateCloudflareWorkersSyncSchema
} from "./cloudflare-workers-schemas";

export type TCloudflareWorkersSyncListItem = z.infer<typeof CloudflareWorkersSyncListItemSchema>;

export type TCloudflareWorkersSync = z.infer<typeof CloudflareWorkersSyncSchema>;

// Only a create defaults variableType; an update may leave it unset on syncs created before it existed.
export type TCloudflareWorkersSyncInput = Omit<
  z.infer<typeof CreateCloudflareWorkersSyncSchema>,
  "destinationConfig"
> & {
  destinationConfig: z.infer<typeof CloudflareWorkersSyncSchema>["destinationConfig"];
};

export type TCloudflareWorkersSyncWithCredentials = TCloudflareWorkersSync & {
  connection: TCloudflareConnection;
};
