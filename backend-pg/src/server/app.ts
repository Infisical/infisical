import dotenv from "dotenv";
import fasitfy from "fastify";
import type { FastifyCookieOptions } from "@fastify/cookie";
import cookie from "@fastify/cookie";
import type { FastifyCorsOptions } from "@fastify/cors";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { FastifyRateLimitOptions } from "@fastify/rate-limit";
import ratelimiter from "@fastify/rate-limit";

import { initDbConnection } from "@app/db";
import { smtpServiceFactory } from "@app/services/smtp/smtp-service";

import { formatSmtpConfig, initEnvConfig } from "@lib/config/env";
import { initLogger } from "@lib/logger";

import { globalRateLimiterCfg } from "./config/rateLimiter";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./plugins/fastify-zod";
import { fastifyIp } from "./plugins/ip";
import { fastifySwagger } from "./plugins/swagger";
import { registerRoutes } from "./routes";

dotenv.config();

// Run the server!
const main = async () => {
  const logger = await initLogger();
  const envCfg = initEnvConfig(logger);

  const server = fasitfy({
    logger,
    trustProxy: true
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  const db = initDbConnection(envCfg.DB_CONNECTION_URI);
  const smtp = smtpServiceFactory(formatSmtpConfig());

  try {
    await server.register<FastifyCookieOptions>(cookie, {
      secret: envCfg.COOKIE_SECRET_SIGN_KEY
    });

    await server.register<FastifyCorsOptions>(cors, {
      credentials: true,
      origin: true
    });
    // pull ip based on various proxy headers
    await server.register(fastifyIp);

    await server.register(fastifySwagger);

    // Rate limiters and security headers
    await server.register<FastifyRateLimitOptions>(ratelimiter, globalRateLimiterCfg);
    await server.register(helmet, { contentSecurityPolicy: false });

    await server.register(registerRoutes, { prefix: "/api", smtp, db });
    await server.ready();
    server.swagger();
    await server.listen({ port: envCfg.PORT, host: envCfg.HOST });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

main();
