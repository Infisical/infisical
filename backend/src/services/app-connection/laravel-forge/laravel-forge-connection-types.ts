import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateLaravelForgeConnectionSchema,
  LaravelForgeConnectionSchema,
  ValidateLaravelForgeConnectionCredentialsSchema
} from "./laravel-forge-connection-schemas";

export type TLaravelForgeConnection = z.infer<typeof LaravelForgeConnectionSchema>;

export type TLaravelForgeConnectionInput = z.infer<typeof CreateLaravelForgeConnectionSchema> & {
  app: AppConnection.LaravelForge;
};

export type TValidateLaravelForgeConnectionCredentialsSchema = typeof ValidateLaravelForgeConnectionCredentialsSchema;

export type TLaravelForgeConnectionConfig = DiscriminativePick<
  TLaravelForgeConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
