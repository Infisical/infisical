import { z } from "zod";

import { TSnowflakeConnection } from "@app/services/app-connection/snowflake";

import { CreateSnowflakeSyncSchema, SnowflakeSyncListItemSchema, SnowflakeSyncSchema } from "./snowflake-sync-schemas";

export type TSnowflakeSync = z.infer<typeof SnowflakeSyncSchema>;

export type TSnowflakeSyncInput = z.infer<typeof CreateSnowflakeSyncSchema>;

export type TSnowflakeSyncListItem = z.infer<typeof SnowflakeSyncListItemSchema>;

export type TSnowflakeSyncWithCredentials = TSnowflakeSync & {
  connection: TSnowflakeConnection;
};
