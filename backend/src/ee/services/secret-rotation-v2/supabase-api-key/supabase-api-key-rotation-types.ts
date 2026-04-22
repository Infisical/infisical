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
