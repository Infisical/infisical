import z from "zod";

import { TDevinConnection } from "@app/services/app-connection/devin";

import { CreateDevinSyncSchema, DevinSyncListItemSchema, DevinSyncSchema } from "./devin-sync-schemas";

export type TDevinSync = z.infer<typeof DevinSyncSchema>;

export type TDevinSyncInput = z.infer<typeof CreateDevinSyncSchema>;

export type TDevinSyncListItem = z.infer<typeof DevinSyncListItemSchema>;

export type TDevinSyncWithCredentials = TDevinSync & {
  connection: TDevinConnection;
};

export type TDevinSecretType = "cookie" | "key-value" | "totp";

export type TDevinSecret = {
  secret_id: string;
  key: string | null;
  note: string | null;
  is_sensitive: boolean;
  secret_type: TDevinSecretType;
  access_type: "org" | "personal";
  created_by: string;
  created_at: number;
  updated_by: string | null;
  updated_at: number | null;
};

export type TDevinListSecretsResponse = {
  items: TDevinSecret[];
  end_cursor: string | null;
  has_next_page: boolean;
  total: number | null;
};
