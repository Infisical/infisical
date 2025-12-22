import { z } from "zod";

import {
  RedisAccountCredentialsSchema,
  RedisAccountSchema,
  RedisResourceConnectionDetailsSchema,
  RedisResourceSchema
} from "./redis-resource-schemas";

// Resources
export type TRedisResource = z.infer<typeof RedisResourceSchema>;
export type TRedisResourceConnectionDetails = z.infer<typeof RedisResourceConnectionDetailsSchema>;

// Accounts
export type TRedisAccount = z.infer<typeof RedisAccountSchema>;
export type TRedisAccountCredentials = z.infer<typeof RedisAccountCredentialsSchema>;
