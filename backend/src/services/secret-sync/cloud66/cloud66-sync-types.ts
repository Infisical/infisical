import z from "zod";

import { TCloud66Connection } from "@app/services/app-connection/cloud-66";

import { Cloud66SyncListItemSchema, Cloud66SyncSchema, CreateCloud66SyncSchema } from "./cloud66-sync-schemas";

export type TCloud66SyncListItem = z.infer<typeof Cloud66SyncListItemSchema>;

export type TCloud66Sync = z.infer<typeof Cloud66SyncSchema>;

export type TCloud66SyncInput = z.infer<typeof CreateCloud66SyncSchema>;

export type TCloud66SyncWithCredentials = TCloud66Sync & {
  connection: TCloud66Connection;
};

export type TCloud66EnvVar = {
  id: number;
  key: string;
  value: string;
  readonly: boolean;
  is_generated: boolean;
};
