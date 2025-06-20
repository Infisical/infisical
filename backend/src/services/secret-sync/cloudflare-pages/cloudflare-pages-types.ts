import z from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflarePagesSyncListItemSchema,
  CloudflarePagesSyncSchema,
  CreateCloudflarePagesSyncSchema
} from "./cloudflare-pages-schema";

export type TCloudflarePagesSyncListItem = z.infer<typeof CloudflarePagesSyncListItemSchema>;

export type TCloudflarePagesSync = z.infer<typeof CloudflarePagesSyncSchema>;

export type TCloudflarePagesSyncInput = z.infer<typeof CreateCloudflarePagesSyncSchema>;

export type TCloudflarePagesSyncWithCredentials = TCloudflarePagesSync & {
  connection: TCloudflareConnection;
};
