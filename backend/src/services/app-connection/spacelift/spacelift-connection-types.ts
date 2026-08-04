import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateSpaceliftConnectionSchema,
  SpaceliftConnectionSchema,
  ValidateSpaceliftConnectionCredentialsSchema
} from "./spacelift-connection-schemas";

export type TSpaceliftConnection = z.infer<typeof SpaceliftConnectionSchema>;

export type TSpaceliftConnectionInput = z.infer<typeof CreateSpaceliftConnectionSchema> & {
  app: AppConnection.Spacelift;
};

export type TValidateSpaceliftConnectionCredentialsSchema = typeof ValidateSpaceliftConnectionCredentialsSchema;

export type TSpaceliftConnectionConfig = DiscriminativePick<
  TSpaceliftConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
