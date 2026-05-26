import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateSupabaseConnectionSchema,
  SupabaseConnectionSchema,
  ValidateSupabaseConnectionCredentialsSchema
} from "./supabase-connection-schemas";

export type TSupabaseConnection = z.infer<typeof SupabaseConnectionSchema>;

export type TSupabaseConnectionInput = z.infer<typeof CreateSupabaseConnectionSchema> & {
  app: AppConnection.Supabase;
};

export type TValidateSupabaseConnectionCredentialsSchema = typeof ValidateSupabaseConnectionCredentialsSchema;

export type TSupabaseConnectionConfig = DiscriminativePick<TSupabaseConnection, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TSupabaseProject = {
  id: string;
  organization_id: string;
  name: string;
  region: string;
  created_at: Date;
  status: string;
  database: TSupabaseDatabase;
};

export type TSupabaseProjectBranch = {
  id: string,
  name: string,
  project_ref: string,
  is_default: boolean
};

type TSupabaseDatabase = {
  host: string;
  version: string;
  postgres_engine: string;
  release_channel: string;
};

export type TSupabaseSecret = {
  name: string;
  value: string;
};
