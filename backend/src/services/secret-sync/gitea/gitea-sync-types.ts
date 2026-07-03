import { z } from "zod";

import { TGiteaConnection } from "@app/services/app-connection/gitea";

import { CreateGiteaSyncSchema, GiteaSyncListItemSchema, GiteaSyncSchema } from "./gitea-sync-schemas";

export type TGiteaSync = z.infer<typeof GiteaSyncSchema>;

export type TGiteaSyncInput = z.infer<typeof CreateGiteaSyncSchema>;

export type TGiteaSyncListItem = z.infer<typeof GiteaSyncListItemSchema>;

export type TGiteaSyncWithCredentials = TGiteaSync & {
  connection: TGiteaConnection;
};

export type TGiteaSecret = {
  name: string;
  description: string;
  created_at: string;
};
