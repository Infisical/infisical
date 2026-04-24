import { z } from "zod";

import { TOnaConnection } from "@app/services/app-connection/ona";

import { CreateOnaSyncSchema, OnaSyncListItemSchema, OnaSyncSchema } from "./ona-sync-schemas";

export type TOnaSync = z.infer<typeof OnaSyncSchema>;

export type TOnaSyncInput = z.infer<typeof CreateOnaSyncSchema>;

export type TOnaSyncListItem = z.infer<typeof OnaSyncListItemSchema>;

export type TOnaSyncWithCredentials = TOnaSync & {
  connection: TOnaConnection;
};

export type TOnaSecret = {
  id: string;
  name: string;
  environmentVariable?: boolean;
  scope?: {
    projectId?: string;
    userId?: string;
    organizationId?: string;
    serviceAccountId?: string;
  };
};

export type TOnaListSecretsResponse = {
  secrets?: TOnaSecret[];
  pagination?: {
    nextToken?: string;
  };
};

export type TOnaGetSecretValueResponse = {
  value?: string;
};
