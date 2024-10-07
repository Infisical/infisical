/* eslint-disable import/extensions */
import path from "node:path";

import type { FastifyCookieOptions } from "@fastify/cookie";
import cookie from "@fastify/cookie";
import type { FastifyCorsOptions } from "@fastify/cors";
import cors from "@fastify/cors";
import fastifyEtag from "@fastify/etag";
import fastifyFormBody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import type { FastifyRateLimitOptions } from "@fastify/rate-limit";
import ratelimiter from "@fastify/rate-limit";
import fastify from "fastify";
import { Knex } from "knex";
import { Logger } from "pino";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, IS_PACKAGED } from "@app/lib/config/env";
import { TQueueServiceFactory } from "@app/queue";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { globalRateLimiterCfg } from "./config/rateLimiter";
import { addErrorsToResponseSchemas } from "./plugins/add-errors-to-response-schemas";
import { fastifyErrHandler } from "./plugins/error-handler";
import { registerExternalNextjs } from "./plugins/external-nextjs";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./plugins/fastify-zod";
import { fastifyIp } from "./plugins/ip";
import { maintenanceMode } from "./plugins/maintenanceMode";
import { fastifySwagger } from "./plugins/swagger";
import { registerRoutes } from "./routes";

type TMain = {
  auditLogDb?: Knex;
  db: Knex;
  smtp: TSmtpService;
  logger?: Logger;
  queue: TQueueServiceFactory;
  keyStore: TKeyStoreFactory;
};

// Run the server!
export const main = async ({ db, auditLogDb, smtp, logger, queue, keyStore }: TMain) => {
  const appCfg = getConfig();
  const server = fastify({
    logger: appCfg.NODE_ENV === "test" ? false : logger,
    trustProxy: true,
    connectionTimeout: 30 * 1000,
    ignoreTrailingSlash: true
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  server.addContentTypeParser("application/scim+json", { parseAs: "string" }, (_, body, done) => {
    try {
      const strBody = body instanceof Buffer ? body.toString() : body;
      if (!strBody) {
        done(null, undefined);
        return;
      }
      const json: unknown = JSON.parse(strBody);
      done(null, json);
    } catch (err) {
      const error = err as Error;
      done(error, undefined);
    }
  });

  try {
    await server.register<FastifyCookieOptions>(cookie, {
      secret: appCfg.COOKIE_SECRET_SIGN_KEY
    });

    await server.register(fastifyEtag);

    await server.register<FastifyCorsOptions>(cors, {
      credentials: true,
      origin: appCfg.SITE_URL || true
    });

    await server.register(addErrorsToResponseSchemas);
    // pull ip based on various proxy headers
    await server.register(fastifyIp);

    await server.register(fastifySwagger);
    await server.register(fastifyFormBody);
    await server.register(fastifyErrHandler);

    // Rate limiters and security headers
    if (appCfg.isProductionMode) {
      await server.register<FastifyRateLimitOptions>(ratelimiter, globalRateLimiterCfg());
    }

    await server.register(helmet, { contentSecurityPolicy: false });

    await server.register(maintenanceMode);

    await server.register(registerRoutes, { smtp, queue, db, auditLogDb, keyStore });

    if (appCfg.isProductionMode) {
      await server.register(registerExternalNextjs, {
        standaloneMode: appCfg.STANDALONE_MODE || IS_PACKAGED,
        dir: path.join(__dirname, IS_PACKAGED ? "../../../" : "../../"),
        port: appCfg.PORT
      });
    }

    await server.ready();
    server.swagger();
    return server;
  } catch (err) {
    server.log.error(err);
    await queue.shutdown();
    process.exit(1);
  }
};
