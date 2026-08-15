import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreatePortainerConnectionSchema,
  PortainerConnectionSchema,
  ValidatePortainerConnectionCredentialsSchema
} from "./portainer-connection-schemas";

export type TPortainerConnection = z.infer<typeof PortainerConnectionSchema>;

export type TPortainerConnectionInput = z.infer<typeof CreatePortainerConnectionSchema> & {
  app: AppConnection.Portainer;
};

export type TValidatePortainerConnectionCredentialsSchema = typeof ValidatePortainerConnectionCredentialsSchema;

export type TPortainerConnectionConfig = DiscriminativePick<
  TPortainerConnectionInput,
  "method" | "app" | "credentials"
>;

export type TPortainerEnvironment = {
  id: number;
  name: string;
};

export type TPortainerStack = {
  id: number;
  name: string;
  environmentId: number;
  isGitBased: boolean;
};
