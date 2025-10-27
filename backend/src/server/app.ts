/* eslint-disable import/extensions */
import path from "node:path";
import { monitorEventLoopDelay } from "perf_hooks";

import type { FastifyCookieOptions } from "@fastify/cookie";
import cookie from "@fastify/cookie";
import type { FastifyCorsOptions } from "@fastify/cors";
import cors from "@fastify/cors";
import fastifyEtag from "@fastify/etag";
import fastifyFormBody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import type { FastifyRateLimitOptions } from "@fastify/rate-limit";
import ratelimiter from "@fastify/rate-limit";
import { fastifyRequestContext } from "@fastify/request-context";
import fastify from "fastify";
import { Cluster, Redis } from "ioredis";
import { Knex } from "knex";

import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, IS_PACKAGED, TEnvConfig } from "@app/lib/config/env";
import { CustomLogger } from "@app/lib/logger/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TQueueServiceFactory } from "@app/queue";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

import { globalRateLimiterCfg } from "./config/rateLimiter";
import { addErrorsToResponseSchemas } from "./plugins/add-errors-to-response-schemas";
import { apiMetrics } from "./plugins/api-metrics";
import { fastifyErrHandler } from "./plugins/error-handler";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./plugins/fastify-zod";
import { fastifyIp } from "./plugins/ip";
import { maintenanceMode } from "./plugins/maintenanceMode";
import { registerServeUI } from "./plugins/serve-ui";
import { fastifySwagger } from "./plugins/swagger";
import { registerRoutes } from "./routes";

// Monitor event loop for readiness checks
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// Server state tracking
const serverState = {
  isReady: false,
  isRunningMigrations: false,
  isWaitingForMigrations: true // Start as true - containers are unhealthy until they acquire migration lock or complete
};

type TMain = {
  auditLogDb?: Knex;
  db: Knex;
  smtp: TSmtpService;
  logger?: CustomLogger;
  queue: TQueueServiceFactory;
  keyStore: TKeyStoreFactory;
  redis: Redis | Cluster;
  envConfig: TEnvConfig;
  superAdminDAL: TSuperAdminDALFactory;
  hsmService: THsmServiceFactory;
  kmsRootConfigDAL: TKmsRootConfigDALFactory;
};

// Run the server!
export const main = async ({
  db,
  auditLogDb,
  smtp,
  logger,
  queue,
  keyStore,
  redis,
  envConfig,
  superAdminDAL,
  hsmService,
  kmsRootConfigDAL
}: TMain) => {
  const appCfg = getConfig();

  const server = fastify({
    logger: appCfg.NODE_ENV === "test" ? false : logger,
    genReqId: () => `req-${alphaNumericNanoId(14)}`,
    trustProxy: true,

    connectionTimeout: appCfg.isHsmConfigured ? 90_000 : 30_000,
    ignoreTrailingSlash: true,
    pluginTimeout: 40_000
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // @ts-expect-error akhilmhdh: even on setting it fastify as Redis | Cluster it's throwing error
  server.decorate("redis", redis);
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
      ...(appCfg.CORS_ALLOWED_ORIGINS?.length
        ? {
            origin: [...appCfg.CORS_ALLOWED_ORIGINS, ...(appCfg.SITE_URL ? [appCfg.SITE_URL] : [])]
          }
        : {
            origin: appCfg.SITE_URL || true
          }),
      ...(appCfg.CORS_ALLOWED_HEADERS?.length && {
        allowedHeaders: appCfg.CORS_ALLOWED_HEADERS
      })
    });

    await server.register(addErrorsToResponseSchemas);
    // pull ip based on various proxy headers
    await server.register(fastifyIp);

    if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
      await server.register(apiMetrics);
    }

    await server.register(fastifySwagger);
    await server.register(fastifyFormBody);
    await server.register(fastifyErrHandler);

    // Rate limiters and security headers
    if (appCfg.isProductionMode && appCfg.isCloud) {
      await server.register<FastifyRateLimitOptions>(ratelimiter, globalRateLimiterCfg());
    }

    await server.register(helmet, { contentSecurityPolicy: false });

    await server.register(maintenanceMode);

    await server.register(fastifyRequestContext, {
      defaultStoreValues: (req) => ({
        reqId: req.id,
        log: req.log.child({ reqId: req.id })
      })
    });

    // Health check - returns 200 only if doing useful work (running migrations or ready)
    // Returns 503 if waiting for another container to finish migrations
    server.get("/api/health", async (_, reply) => {
      if (serverState.isWaitingForMigrations) {
        return reply.code(503).send({
          status: "waiting",
          message: "Waiting for migrations to complete in another container"
        });
      }
      return { status: "ok", message: "Server is alive" };
    });

    // Global preHandler to block requests during migrations
    // Excludes /api/health and /api/ready endpoints
    server.addHook("preHandler", async (request, reply) => {
      if (request.url === "/api/health" || request.url === "/api/ready") {
        return;
      }
      if (!serverState.isReady) {
        return reply.code(503).send({
          status: "unavailable",
          message: "Server is starting up, migrations in progress. Please try again in a moment."
        });
      }
    });

    // Readiness check - returns 503 until migrations are complete
    server.get("/api/ready", async (request, reply) => {
      const cfg = getConfig();

      // Calculate event loop statistics
      const meanLagMs = histogram.mean / 1e6;
      const maxLagMs = histogram.max / 1e6;
      const p99LagMs = histogram.percentile(99) / 1e6;

      request.log.info(
        `Event loop stats - Mean: ${meanLagMs.toFixed(2)}ms, Max: ${maxLagMs.toFixed(2)}ms, p99: ${p99LagMs.toFixed(2)}ms`
      );

      request.log.info(`Raw event loop stats: ${JSON.stringify(histogram, null, 2)}`);

      if (!serverState.isReady) {
        return reply.code(503).send({
          date: new Date(),
          message: "Server is starting up, migrations in progress",
          emailConfigured: cfg.isSmtpConfigured,
          redisConfigured: cfg.isRedisConfigured,
          secretScanningConfigured: cfg.isSecretScanningConfigured,
          samlDefaultOrgSlug: cfg.samlDefaultOrgSlug,
          auditLogStorageDisabled: Boolean(cfg.DISABLE_AUDIT_LOG_STORAGE)
        });
      }

      const serverCfg = await getServerCfg();

      return {
        date: new Date(),
        message: "Ok",
        emailConfigured: cfg.isSmtpConfigured,
        inviteOnlySignup: Boolean(serverCfg.allowSignUp),
        redisConfigured: cfg.isRedisConfigured,
        secretScanningConfigured: cfg.isSecretScanningConfigured,
        samlDefaultOrgSlug: cfg.samlDefaultOrgSlug,
        auditLogStorageDisabled: Boolean(cfg.DISABLE_AUDIT_LOG_STORAGE)
      };
    });

    await server.register(registerRoutes, {
      smtp,
      queue,
      db,
      auditLogDb,
      keyStore,
      hsmService,
      envConfig,
      superAdminDAL,
      kmsRootConfigDAL
    });

    await server.register(registerServeUI, {
      standaloneMode: appCfg.STANDALONE_MODE || IS_PACKAGED,
      dir: path.join(__dirname, IS_PACKAGED ? "../../../" : "../../")
    });

    await server.ready();
    server.swagger();
    return server;
  } catch (err) {
    server.log.error(err);
    await queue.shutdown();
    process.exit(1);
  }
};

// Functions to manage server state
export const markServerReady = () => {
  serverState.isReady = true;
  serverState.isRunningMigrations = false;
  serverState.isWaitingForMigrations = false;
};

export const markRunningMigrations = () => {
  serverState.isRunningMigrations = true;
  serverState.isWaitingForMigrations = false;
};
