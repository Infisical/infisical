import z from "zod";

import { TSpaceliftConnection } from "@app/services/app-connection/spacelift";

import { CreateSpaceliftSyncSchema, SpaceliftSyncListItemSchema, SpaceliftSyncSchema } from "./spacelift-sync-schemas";

export type TSpaceliftSyncListItem = z.infer<typeof SpaceliftSyncListItemSchema>;

export type TSpaceliftSync = z.infer<typeof SpaceliftSyncSchema>;

export type TSpaceliftSyncInput = z.infer<typeof CreateSpaceliftSyncSchema>;

export type TSpaceliftSyncWithCredentials = TSpaceliftSync & {
  connection: TSpaceliftConnection;
};
