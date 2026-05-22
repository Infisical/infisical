import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateSnowflakeConnectionSchema,
  SnowflakeConnectionSchema,
  ValidateSnowflakeConnectionCredentialsSchema
} from "./snowflake-connection-schemas";

export type TSnowflakeConnection = z.infer<typeof SnowflakeConnectionSchema>;

export type TSnowflakeConnectionInput = z.infer<typeof CreateSnowflakeConnectionSchema> & {
  app: AppConnection.Snowflake;
};

export type TValidateSnowflakeConnectionCredentialsSchema = typeof ValidateSnowflakeConnectionCredentialsSchema;

export type TSnowflakeConnectionConfig = DiscriminativePick<
  TSnowflakeConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
