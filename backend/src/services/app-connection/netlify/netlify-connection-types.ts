import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateNetlifyConnectionSchema,
  NetlifyConnectionSchema,
  ValidateNetlifyConnectionCredentialsSchema
} from "./netlify-connection-schemas";

export type TNetlifyConnection = z.infer<typeof NetlifyConnectionSchema>;

export type TNetlifyConnectionInput = z.infer<typeof CreateNetlifyConnectionSchema> & {
  app: AppConnection.Netlify;
};

export type TValidateNetlifyConnectionCredentialsSchema = typeof ValidateNetlifyConnectionCredentialsSchema;

export type TNetlifyConnectionConfig = DiscriminativePick<TNetlifyConnection, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TNetlifyVariable = {
  key: string;
  id?: string; // ID of the variable (present in responses)
  created_at?: string;
  updated_at?: string;
  is_secret?: boolean;
  values: TNetlifyVariableValue[];
};

export type TNetlifyVariableValue = {
  id?: string;
  context: string; // "all", "dev", "branch-deploy", etc.
  value?: string; // Omitted in response if `is_secret` is true
  site_id?: string; // Optional: overrides at site-level
  created_at?: string;
  updated_at?: string;
};

export type TNetlifyAccount = {
  id: string;
  name: string;
};

export type TNetlifySite = {
  id: string;
  name: string;
};
