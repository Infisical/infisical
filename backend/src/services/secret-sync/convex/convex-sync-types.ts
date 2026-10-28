import { z } from "zod";

import { TConvexConnection } from "@app/services/app-connection/convex";

import { ConvexSyncListItemSchema, ConvexSyncSchema, CreateConvexSyncSchema } from "./convex-sync-schemas";

export type TConvexSync = z.infer<typeof ConvexSyncSchema>;

export type TConvexSyncInput = z.infer<typeof CreateConvexSyncSchema>;

export type TConvexSyncListItem = z.infer<typeof ConvexSyncListItemSchema>;

export type TConvexSyncWithCredentials = TConvexSync & {
  connection: TConvexConnection;
};

export type TConvexEnvVarChange = {
  name: string;
  value: string | null;
};
