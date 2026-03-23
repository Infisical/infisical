import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateExternalInfisicalConnectionSchema,
  ExternalInfisicalConnectionSchema,
  ValidateExternalInfisicalConnectionCredentialsSchema
} from "./external-infisical-connection-schemas";

export type TExternalInfisicalConnection = z.infer<typeof ExternalInfisicalConnectionSchema>;

export type TExternalInfisicalConnectionInput = z.infer<typeof CreateExternalInfisicalConnectionSchema> & {
  app: AppConnection.ExternalInfisical;
};

export type TValidateExternalInfisicalConnectionCredentialsSchema =
  typeof ValidateExternalInfisicalConnectionCredentialsSchema;

export type TExternalInfisicalConnectionConfig = DiscriminativePick<
  TExternalInfisicalConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
