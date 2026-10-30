import z from "zod";

import { TDaytonaConnection } from "@app/services/app-connection/daytona";

import { CreateDaytonaSyncSchema, DaytonaSyncListItemSchema, DaytonaSyncSchema } from "./daytona-sync-schemas";

export type TDaytonaSyncListItem = z.infer<typeof DaytonaSyncListItemSchema>;

export type TDaytonaSync = z.infer<typeof DaytonaSyncSchema>;

export type TDaytonaSyncInput = z.infer<typeof CreateDaytonaSyncSchema>;

export type TDaytonaSyncWithCredentials = TDaytonaSync & {
  connection: TDaytonaConnection;
};

export type TDaytonaSecret = {
  id: string;
  name: string;
};

export type TDaytonaListSecretsResponse = {
  items: TDaytonaSecret[];
  total: number;
  nextCursor: string | null;
};
