import { z } from "zod";

import { TRedisConnection } from "@app/services/app-connection/redis";

import {
  CreateRedisCredentialsRotationSchema,
  RedisCredentialsRotationGeneratedCredentialsSchema,
  RedisCredentialsRotationListItemSchema,
  RedisCredentialsRotationSchema
} from "./redis-credentials-rotation-schemas";

export type TRedisCredentialsRotation = z.infer<typeof RedisCredentialsRotationSchema>;

export type TRedisCredentialsRotationInput = z.infer<typeof CreateRedisCredentialsRotationSchema>;

export type TRedisCredentialsRotationListItem = z.infer<typeof RedisCredentialsRotationListItemSchema>;

export type TRedisCredentialsRotationWithConnection = TRedisCredentialsRotation & {
  connection: TRedisConnection;
};

export type TRedisCredentialsRotationGeneratedCredentials = z.infer<
  typeof RedisCredentialsRotationGeneratedCredentialsSchema
>;
