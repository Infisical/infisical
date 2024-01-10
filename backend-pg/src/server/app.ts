import type { FastifyCookieOptions } from "@fastify/cookie";
import cookie from "@fastify/cookie";
import type { FastifyCorsOptions } from "@fastify/cors";
import cors from "@fastify/cors";
import fastifyFormBody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import type { FastifyRateLimitOptions } from "@fastify/rate-limit";
import ratelimiter from "@fastify/rate-limit";
import fasitfy from "fastify";
import { Knex } from "knex";
import { Logger } from "pino";

import { TQueueServiceFactory } from "@app/queue";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { getConfig } from "@lib/config/env";

import { globalRateLimiterCfg } from "./config/rateLimiter";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./plugins/fastify-zod";
import { fastifyIp } from "./plugins/ip";
import { fastifySwagger } from "./plugins/swagger";
import { registerRoutes } from "./routes";

type TMain = {
  db: Knex;
  smtp: TSmtpService;
  logger?: Logger;
  queue: TQueueServiceFactory;
};

// Run the server!
export const main = async ({ db, smtp, logger, queue }: TMain) => {
  const appCfg = getConfig();
  const server = fasitfy({
    logger,
    trustProxy: true
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  try {
    await server.register<FastifyCookieOptions>(cookie, {
      secret: appCfg.COOKIE_SECRET_SIGN_KEY
    });

    await server.register<FastifyCorsOptions>(cors, {
      credentials: true,
      origin: true
    });
    // pull ip based on various proxy headers
    await server.register(fastifyIp);

    await server.register(fastifySwagger);
    await server.register(fastifyFormBody);

    // Rate limiters and security headers
    await server.register<FastifyRateLimitOptions>(ratelimiter, globalRateLimiterCfg);
    await server.register(helmet, { contentSecurityPolicy: false });

    await server.register(registerRoutes, { prefix: "/api", smtp, queue, db });
    await server.ready();
    server.swagger();
    return server;
  } catch (err) {
    server.log.error(err);
    await queue.shutdown();
    process.exit(1);
  }
};
