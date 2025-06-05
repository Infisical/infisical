import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CoolifyConnectionSchema,
  CreateCoolifyConnectionSchema,
  ValidateCoolifyConnectionCredentialsSchema
} from "./coolify-connection-schemas";

export type TCoolifyConnection = z.infer<typeof CoolifyConnectionSchema>;

export type TCoolifyConnectionInput = z.infer<typeof CreateCoolifyConnectionSchema> & {
  app: AppConnection.Coolify;
};

export type TValidateCoolifyConnectionCredentialsSchema = typeof ValidateCoolifyConnectionCredentialsSchema;

export type TCoolifyConnectionConfig = DiscriminativePick<TCoolifyConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TCoolifyApplication = {
  uuid: string;
  name: string;
  environment_id: number;
  projectName: string;
  environmentName: string;
  created_at: string;
  updated_at: string;
};

export type TCoolifyProject = {
  id: number;
  uuid: string;
  description: string;
  created_at: string;
  updated_at: string;
  environments: TCoolifyProjectEnvironment[];
};

export type TCoolifyProjectEnvironment = {
  id: number;
  uuid: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  projectName: string;
};
