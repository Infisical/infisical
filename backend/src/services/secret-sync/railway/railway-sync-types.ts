import z from "zod";

import { TRailwayConnection } from "@app/services/app-connection/railway";

import { CreateRailwaySyncSchema, RailwaySyncListItemSchema, RailwaySyncSchema } from "./railway-sync-schemas";

export type TRailwaySyncListItem = z.infer<typeof RailwaySyncListItemSchema>;

export type TRailwaySync = z.infer<typeof RailwaySyncSchema>;

export type TRailwaySyncInput = z.infer<typeof CreateRailwaySyncSchema>;

export type TRailwaySyncWithCredentials = TRailwaySync & {
  connection: TRailwayConnection;
};

export type TRailwaySecret = {
  createdAt: string;
  environmentId?: string | null;
  id: string;
  isSealed: boolean;
  name: string;
  serviceId?: string | null;
  updatedAt: string;
};

export type TRailwayVariablesGraphResponse = {
  data: {
    variables: Record<string, string>;
  };
};
