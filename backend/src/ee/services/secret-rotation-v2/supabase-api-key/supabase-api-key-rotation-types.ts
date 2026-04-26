import { z } from "zod";

import { TSupabaseConnection } from "@app/services/app-connection/supabase";

import {
  CreateSupabaseApiKeyRotationSchema,
  SupabaseApiKeyRotationGeneratedCredentialsSchema,
  SupabaseApiKeyRotationListItemSchema,
  SupabaseApiKeyRotationSchema
} from "./supabase-api-key-rotation-schemas";

export type TSupabaseApiKeyRotation = z.infer<typeof SupabaseApiKeyRotationSchema>;

export type TSupabaseApiKeyRotationInput = z.infer<typeof CreateSupabaseApiKeyRotationSchema>;

export type TSupabaseApiKeyRotationListItem = z.infer<typeof SupabaseApiKeyRotationListItemSchema>;

export type TSupabaseApiKeyRotationWithConnection = TSupabaseApiKeyRotation & {
  connection: TSupabaseConnection;
};

export type TSupabaseApiKeyRotationGeneratedCredentials = z.infer<
  typeof SupabaseApiKeyRotationGeneratedCredentialsSchema
>;

export type TSupabaseApiKeyCreateResponse = {
  api_key: string | null;
  id: string | null;
  type: "legacy" | "publishable" | "secret" | null;
  prefix: string | null;
  name: string;
  description: string | null;
  hash: string | null;
  secret_jwt_template: Record<string, unknown> | null;
  inserted_at: string | null;
  updated_at: string | null;
};
