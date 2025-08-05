import z from "zod";

import { TNetlifyConnection } from "@app/services/app-connection/netlify";

import { CreateNetlifySyncSchema, NetlifySyncListItemSchema, NetlifySyncSchema } from "./netlify-sync-schemas";

export type TNetlifySyncListItem = z.infer<typeof NetlifySyncListItemSchema>;

export type TNetlifySync = z.infer<typeof NetlifySyncSchema>;

export type TNetlifySyncInput = z.infer<typeof CreateNetlifySyncSchema>;

export type TNetlifySyncWithCredentials = TNetlifySync & {
  connection: TNetlifyConnection;
};
