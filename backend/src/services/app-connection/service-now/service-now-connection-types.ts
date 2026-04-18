import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateServiceNowConnectionSchema,
  ServiceNowConnectionSchema,
  ValidateServiceNowConnectionCredentialsSchema
} from "./service-now-connection-schemas";

export type TServiceNowConnection = z.infer<typeof ServiceNowConnectionSchema>;

export type TServiceNowConnectionInput = z.infer<typeof CreateServiceNowConnectionSchema> & {
  app: AppConnection.ServiceNow;
};

export type TValidateServiceNowConnectionCredentialsSchema = typeof ValidateServiceNowConnectionCredentialsSchema;

export type TServiceNowConnectionConfig = DiscriminativePick<
  TServiceNowConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
