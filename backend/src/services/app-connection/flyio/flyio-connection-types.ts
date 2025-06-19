import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateFlyioConnectionSchema,
  FlyioConnectionSchema,
  ValidateFlyioConnectionCredentialsSchema
} from "./flyio-connection-schemas";

export type TFlyioConnection = z.infer<typeof FlyioConnectionSchema>;

export type TFlyioConnectionInput = z.infer<typeof CreateFlyioConnectionSchema> & {
  app: AppConnection.Flyio;
};

export type TValidateFlyioConnectionCredentialsSchema = typeof ValidateFlyioConnectionCredentialsSchema;

export type TFlyioConnectionConfig = DiscriminativePick<TFlyioConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TFlyioApp = {
  id: string;
  name: string;
};
