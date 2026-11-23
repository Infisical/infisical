import { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { Cluster, Redis } from "ioredis";
import type { Knex } from "knex";

import { CustomLogger } from "@app/lib/logger/logger";
import { ZodTypeProvider } from "@app/server/plugins/fastify-zod";
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

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
  const testSuperAdminDAL: TSuperAdminDALFactory;
  const jwtAuthToken: string;
}
