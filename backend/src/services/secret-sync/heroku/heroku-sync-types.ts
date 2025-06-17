import { z } from "zod";

import { THerokuConnection } from "@app/services/app-connection/heroku";

import { CreateHerokuSyncSchema, HerokuSyncListItemSchema, HerokuSyncSchema } from "./heroku-sync-schemas";

export type THerokuSync = z.infer<typeof HerokuSyncSchema>;
export type THerokuSyncInput = z.infer<typeof CreateHerokuSyncSchema>;
export type THerokuSyncListItem = z.infer<typeof HerokuSyncListItemSchema>;

export type THerokuSyncWithCredentials = THerokuSync & {
  connection: THerokuConnection;
};

export type THerokuConfigVars = Record<string, string | null>;

export type THerokuListVariables = {
  authToken: string;
  app: string;
};

export type THerokuUpdateVariables = THerokuListVariables & {
  configVars: THerokuConfigVars;
};
