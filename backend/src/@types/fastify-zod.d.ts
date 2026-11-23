import { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { Cluster, Redis } from "ioredis";
import type { Knex } from "knex";

import { CustomLogger } from "@app/lib/logger/logger";
import { ZodTypeProvider } from "@app/server/plugins/fastify-zod";

declare global {
  type FastifyZodProvider = FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression<RawServerDefault>,
    RawReplyDefaultExpression<RawServerDefault>,
    Readonly<CustomLogger>,
    ZodTypeProvider
  >;

  // used only for testing
  const testServer: FastifyZodProvider;
  const testDb: Knex;
  const testRedis: Redis | Cluster;
  const jwtAuthToken: string;
}
