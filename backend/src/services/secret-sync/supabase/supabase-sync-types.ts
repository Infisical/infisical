import z from "zod";

import { TSupabaseConnection } from "@app/services/app-connection/supabase";

import { CreateSupabaseSyncSchema, SupabaseSyncListItemSchema, SupabaseSyncSchema } from "./supabase-sync-schemas";

export type TSupabaseSyncListItem = z.infer<typeof SupabaseSyncListItemSchema>;

export type TSupabaseSync = z.infer<typeof SupabaseSyncSchema>;

export type TSupabaseSyncInput = z.infer<typeof CreateSupabaseSyncSchema>;

export type TSupabaseSyncWithCredentials = TSupabaseSync & {
  connection: TSupabaseConnection;
};

export type TSupabaseVariablesGraphResponse = {
  data: {
    variables: Record<string, string>;
  };
};
