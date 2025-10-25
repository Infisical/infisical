import { z } from "zod";

import { TNorthflankConnection } from "@app/services/app-connection/northflank";

import {
  CreateNorthflankSyncSchema,
  NorthflankSyncListItemSchema,
  NorthflankSyncSchema
} from "./northflank-sync-schemas";

export type TNorthflankSyncListItem = z.infer<typeof NorthflankSyncListItemSchema>;

export type TNorthflankSync = z.infer<typeof NorthflankSyncSchema>;

export type TNorthflankSyncInput = z.infer<typeof CreateNorthflankSyncSchema>;

export type TNorthflankSyncWithCredentials = TNorthflankSync & {
  connection: TNorthflankConnection;
};
