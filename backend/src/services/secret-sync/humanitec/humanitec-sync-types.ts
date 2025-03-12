import z from "zod";

import { THumanitecConnection } from "@app/services/app-connection/humanitec";

import { CreateHumanitecSyncSchema, HumanitecSyncListItemSchema, HumanitecSyncSchema } from "./humanitec-sync-schemas";

export type THumanitecSyncListItem = z.infer<typeof HumanitecSyncListItemSchema>;

export type THumanitecSync = z.infer<typeof HumanitecSyncSchema>;

export type THumanitecSyncInput = z.infer<typeof CreateHumanitecSyncSchema>;

export type THumanitecSyncWithCredentials = THumanitecSync & {
  connection: THumanitecConnection;
};

export type HumanitecSecret = {
  description: string;
  is_secret: boolean;
  key: string;
  source: "app" | "env";
  value: string;
};
