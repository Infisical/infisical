import z from "zod";

import { TConvexConnection } from "@app/services/app-connection/convex/convex-connection-types";

import { ConvexSyncListItemSchema, ConvexSyncSchema, CreateConvexSyncSchema } from "./convex-sync-schemas";

export type TConvexSyncListItem = z.infer<typeof ConvexSyncListItemSchema>;

export type TConvexSync = z.infer<typeof ConvexSyncSchema>;

export type TConvexSyncInput = z.infer<typeof CreateConvexSyncSchema>;

export type TConvexSyncWithCredentials = TConvexSync & {
  connection: TConvexConnection;
};

export type TConvexEnvVarChange = {
  name: string;
  value: string | null;
};

export type TConvexListEnvVarsResponse = {
  environmentVariables: Record<string, string>;
};

export type TConvexUpdateEnvVarsRequest = {
  changes: TConvexEnvVarChange[];
};
