import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateRedisConnectionSchema,
  RedisConnectionSchema,
  ValidateRedisConnectionCredentialsSchema
} from "./redis-connection-schemas";

export type TRedisConnection = z.infer<typeof RedisConnectionSchema>;

export type TRedisConnectionInput = z.infer<typeof CreateRedisConnectionSchema> & {
  app: AppConnection.Redis;
};

export type TValidateRedisConnectionCredentialsSchema = typeof ValidateRedisConnectionCredentialsSchema;

export type TRedisConnectionConfig = DiscriminativePick<TRedisConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
