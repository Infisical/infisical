import z from "zod";

import { TVercelConnection } from "@app/services/app-connection/vercel";

import { VercelEnvironmentType } from "./vercel-sync-enums";
import { CreateVercelSyncSchema, VercelSyncListItemSchema, VercelSyncSchema } from "./vercel-sync-schemas";

export type TVercelSyncListItem = z.infer<typeof VercelSyncListItemSchema>;

export type TVercelSync = z.infer<typeof VercelSyncSchema>;

export type TVercelSyncInput = z.infer<typeof CreateVercelSyncSchema>;

export type TVercelSyncWithCredentials = TVercelSync & {
  connection: TVercelConnection;
};

export type VercelSecret = {
  description: string;
  is_secret: boolean;
  key: string;
  source: "app" | "env";
  value: string;
};

export interface VercelApiSecret {
  id: string;
  key: string;
  value: string;
  type: string;
  target: string[];
  customEnvironmentIds?: string[];
  gitBranch?: string;
  createdAt?: number;
  updatedAt?: number;
  configurationId?: string;
  system?: boolean;
}

export type DefaultVercelEnvType = (typeof VercelEnvironmentType)[keyof typeof VercelEnvironmentType];
