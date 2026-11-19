import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateS3CompatibleConnectionSchema,
  S3CompatibleConnectionSchema,
  ValidateS3CompatibleConnectionCredentialsSchema
} from "./s3-compatible-connection-schemas";

export type TS3CompatibleConnection = z.infer<typeof S3CompatibleConnectionSchema>;

export type TS3CompatibleConnectionInput = z.infer<typeof CreateS3CompatibleConnectionSchema> & {
  app: AppConnection.S3Compatible;
};

export type TValidateS3CompatibleConnectionCredentialsSchema = typeof ValidateS3CompatibleConnectionCredentialsSchema;

export type TS3CompatibleConnectionConfig = DiscriminativePick<
  TS3CompatibleConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
