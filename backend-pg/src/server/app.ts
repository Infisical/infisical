import dotenv from "dotenv";
import fasitfy from "fastify";
import { z } from "zod";
import type { FastifyCookieOptions } from "@fastify/cookie";
import cookie from "@fastify/cookie";
import type { FastifyCorsOptions } from "@fastify/cors";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { FastifyRateLimitOptions } from "@fastify/rate-limit";
import ratelimiter from "@fastify/rate-limit";

import { initEnvConfig } from "@lib/config/env";
import { initLogger } from "@lib/logger";

import { globalRateLimiterCfg } from "./config/rateLimiter";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./plugins/fastify-zod";
import { fastifyIp } from "./plugins/ip";
import { fastifySwagger } from "./plugins/swagger";

dotenv.config();

// Run the server!
const main = async () => {
  const logger = await initLogger();
  initEnvConfig(logger);

  const server = fasitfy({
    logger,
    trustProxy: true
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  try {
    // TODO(akhilmhdh:pg): change this to environment variable with default
    await server.register<FastifyCookieOptions>(cookie, {
      secret: "infisical-cookie-secret"
    });

    await server.register<FastifyCorsOptions>(cors, {
      credentials: true,
      origin: "http://localhost:3000"
    });
    // pull ip based on various proxy headers
    await server.register(fastifyIp);

    // Rate limiters and security headers
    await server.register<FastifyRateLimitOptions>(ratelimiter, globalRateLimiterCfg);
    await server.register(helmet);

    await server.register(fastifySwagger);

    // Declare a route
    server.route({
      method: "GET",
      url: "/",
      schema: {
        response: {
          200: z.object({ hello: z.string() })
        }
      },
      handler: () => ({
        hello: "world"
      })
    });

    await server.ready();
    server.swagger();
    await server.listen({ port: 8000 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

main();
