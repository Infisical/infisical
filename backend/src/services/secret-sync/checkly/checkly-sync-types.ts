import z from "zod";

import { TChecklyConnection, TChecklyVariable } from "@app/services/app-connection/checkly";

import { ChecklySyncListItemSchema, ChecklySyncSchema, CreateChecklySyncSchema } from "./checkly-sync-schemas";

export type TChecklySyncListItem = z.infer<typeof ChecklySyncListItemSchema>;

export type TChecklySync = z.infer<typeof ChecklySyncSchema>;

export type TChecklySyncInput = z.infer<typeof CreateChecklySyncSchema>;

export type TChecklySyncWithCredentials = TChecklySync & {
  connection: TChecklyConnection;
};

export type TChecklySecret = TChecklyVariable;

export type TChecklyVariablesGraphResponse = {
  data: {
    variables: Record<string, string>;
  };
};
