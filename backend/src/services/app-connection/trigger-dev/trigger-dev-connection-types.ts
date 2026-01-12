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
  TTriggerDevConnection,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
