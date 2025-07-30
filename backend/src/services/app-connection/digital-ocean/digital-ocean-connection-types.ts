import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDigitalOceanConnectionSchema,
  DigitalOceanConnectionSchema,
  ValidateDigitalOceanConnectionCredentialsSchema
} from "./digital-ocean-connection-schemas";

export type TDigitalOceanConnection = z.infer<typeof DigitalOceanConnectionSchema>;

export type TDigitalOceanConnectionInput = z.infer<typeof CreateDigitalOceanConnectionSchema> & {
  app: AppConnection.DigitalOcean;
};

export type TValidateDigitalOceanCredentialsSchema = typeof ValidateDigitalOceanConnectionCredentialsSchema;

export type TDigitalOceanConnectionConfig = DiscriminativePick<
  TDigitalOceanConnection,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TDigitalOceanVariable = {
  key: string;
  value: string;
  type: "SECRET" | "GENERAL";
};

export type TDigitalOceanApp = {
  id: string;
  spec: {
    name: string;
    services: Array<{
      name: string;
    }>;
    envs?: TDigitalOceanVariable[];
  };
};
