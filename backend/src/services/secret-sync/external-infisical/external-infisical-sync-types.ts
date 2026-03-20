import z from "zod";

import { TExternalInfisicalConnection } from "@app/services/app-connection/external-infisical";

import {
  CreateExternalInfisicalSyncSchema,
  ExternalInfisicalSyncListItemSchema,
  ExternalInfisicalSyncSchema
} from "./external-infisical-sync-schemas";

export type TExternalInfisicalSyncListItem = z.infer<typeof ExternalInfisicalSyncListItemSchema>;

export type TExternalInfisicalSync = z.infer<typeof ExternalInfisicalSyncSchema>;

export type TExternalInfisicalSyncInput = z.infer<typeof CreateExternalInfisicalSyncSchema>;

export type TExternalInfisicalSyncWithCredentials = TExternalInfisicalSync & {
  connection: TExternalInfisicalConnection;
};
