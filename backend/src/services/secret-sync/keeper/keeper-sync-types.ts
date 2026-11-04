import z from "zod";

import { TKeeperConnection } from "@app/services/app-connection/keeper";

import { CreateKeeperSyncSchema, KeeperSyncListItemSchema, KeeperSyncSchema } from "./keeper-sync-schemas";

export type TKeeperSyncListItem = z.infer<typeof KeeperSyncListItemSchema>;

export type TKeeperSync = z.infer<typeof KeeperSyncSchema>;

export type TKeeperSyncInput = z.infer<typeof CreateKeeperSyncSchema>;

export type TKeeperSyncWithCredentials = TKeeperSync & {
  connection: TKeeperConnection;
};

export type TKeeperListEntry = {
  type?: string;
  uid?: string;
  record_uid?: string;
};

export type TKeeperListResponse = TKeeperListEntry[] | { records?: TKeeperListEntry[] };

export type TKeeperRecordField = {
  type?: string;
  value?: unknown[];
};

export type TKeeperRecord = {
  record_uid?: string;
  title?: string;
  type?: string;
  fields?: TKeeperRecordField[];
};

export type TKeeperLoginRecord = {
  uid: string;
  title: string;
  value: string;
};
