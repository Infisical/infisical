import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateTriggerDevConnectionSchema,
  TriggerDevConnectionSchema,
  ValidateTriggerDevConnectionCredentialsSchema
} from "./trigger-dev-connection-schemas";

export type TTriggerDevConnection = z.infer<typeof TriggerDevConnectionSchema>;

export type TTriggerDevConnectionInput = z.infer<typeof CreateTriggerDevConnectionSchema> & {
  app: AppConnection.TriggerDev;
};

export type TValidateTriggerDevConnectionCredentialsSchema = typeof ValidateTriggerDevConnectionCredentialsSchema;

export type TTriggerDevConnectionConfig = DiscriminativePick<
  TTriggerDevConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TTriggerDevProject = {
  id: string;
  name: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export type TTriggerDevEnvironment = {
  id: string;
  // The slug is the environment identifier used by the env-vars API (e.g. "dev", "stg", "prod", "preview")
  slug: string;
  type: string;
};
