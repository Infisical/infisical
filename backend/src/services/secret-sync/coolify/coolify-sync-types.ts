import z from "zod";

import { CoolifySyncListItemSchema, CoolifySyncSchema, CreateCoolifySyncSchema } from "./coolify-sync-schemas";
import { TCoolifyConnection } from "@app/services/app-connection/coolify";

export type TCoolifySync = z.infer<typeof CoolifySyncSchema>;

export type TCoolifySyncInput = z.infer<typeof CreateCoolifySyncSchema>;

export type TCoolifySyncListItem = z.infer<typeof CoolifySyncListItemSchema>;

export type TCoolifySyncWithCredentials = TCoolifySync & {
  connection: TCoolifyConnection;
}
