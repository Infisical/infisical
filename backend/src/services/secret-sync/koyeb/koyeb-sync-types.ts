import z from "zod";

import { TKoyebConnection } from "@app/services/app-connection/koyeb/koyeb-connection-types";

import { CreateKoyebSyncSchema, KoyebSyncListItemSchema, KoyebSyncSchema } from "./koyeb-sync-schemas";

export type TKoyebSyncListItem = z.infer<typeof KoyebSyncListItemSchema>;

export type TKoyebSync = z.infer<typeof KoyebSyncSchema>;

export type TKoyebSyncInput = z.infer<typeof CreateKoyebSyncSchema>;

export type TKoyebSyncWithCredentials = TKoyebSync & {
  connection: TKoyebConnection;
};
