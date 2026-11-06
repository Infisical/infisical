import z from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflarePagesSyncListItemSchema,
  CloudflarePagesSyncSchema,
  CreateCloudflarePagesSyncSchema
} from "./cloudflare-pages-schema";

export type TCloudflarePagesSyncListItem = z.infer<typeof CloudflarePagesSyncListItemSchema>;

export type TCloudflarePagesSync = z.infer<typeof CloudflarePagesSyncSchema>;

// Only a create defaults variableType; an update may leave it unset on syncs created before it existed.
export type TCloudflarePagesSyncInput = Omit<z.infer<typeof CreateCloudflarePagesSyncSchema>, "destinationConfig"> & {
  destinationConfig: z.infer<typeof CloudflarePagesSyncSchema>["destinationConfig"];
};

export type TCloudflarePagesSyncWithCredentials = TCloudflarePagesSync & {
  connection: TCloudflareConnection;
};
