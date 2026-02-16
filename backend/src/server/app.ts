/* eslint-disable import/extensions */
import path from "node:path";

import type { ClickHouseClient } from "@clickhouse/client";
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
import websocket from "@fastify/websocket";
import fastify, { FastifyInstance, FastifyRequest } from "fastify";
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

import { globalRateLimiterCfg } from "./config/rateLimiter";
import { apiMetrics } from "./plugins/api-metrics";
import { fastifyErrHandler } from "./plugins/error-handler";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./plugins/fastify-zod";
import { fastifyIp } from "./plugins/ip";
import { maintenanceMode } from "./plugins/maintenanceMode";
import { registerResponseSchemaHooks } from "./plugins/response-schema-hooks";
import { registerServeUI } from "./plugins/serve-ui";
import { fastifySwagger } from "./plugins/swagger";
import { registerRoutes } from "./routes";

type TMain = {
  auditLogDb?: Knex;
  db: Knex;
  smtp: TSmtpService;
  logger?: CustomLogger;
  queue: TQueueServiceFactory;
  keyStore: TKeyStoreFactory;
  redis: Redis | Cluster;
  clickhouse: ClickHouseClient | null;
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
  clickhouse,
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

    // Dynamic CORS: MCP OAuth routes need permissive CORS for browser-based flows (MCP Inspector)
    await server.register(
      cors,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_instance: FastifyInstance) =>
        (req: FastifyRequest, callback: (err: Error | null, options: FastifyCorsOptions) => void) => {
          const isMcpOAuthRoute =
            req.url.startsWith("/.well-known/oauth-protected-resource") ||
            req.url.startsWith("/.well-known/oauth-authorization-server") ||
            req.url.startsWith("/mcp-endpoints/") ||
            (req.url.includes("/ai/mcp/endpoints/") && req.url.includes("/oauth/"));

          if (isMcpOAuthRoute) {
            callback(null, { origin: true, credentials: false });
            return;
          }

          // Default CORS config for other routes
          const defaultOrigin = appCfg.CORS_ALLOWED_ORIGINS?.length
            ? [...appCfg.CORS_ALLOWED_ORIGINS, ...(appCfg.SITE_URL ? [appCfg.SITE_URL] : [])]
            : appCfg.SITE_URL || true;

          callback(null, {
            credentials: true,
            origin: defaultOrigin,
            ...(appCfg.CORS_ALLOWED_HEADERS?.length && {
              allowedHeaders: appCfg.CORS_ALLOWED_HEADERS
            })
          });
        }
    );

    await server.register(registerResponseSchemaHooks);
    // pull ip based on various proxy headers
    await server.register(fastifyIp);

    if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
      await server.register(apiMetrics);
    }

    await server.register(fastifySwagger);
    await server.register(fastifyFormBody);
    await server.register(websocket, {
      options: { maxPayload: 64 * 1024 } // 64 KB
    });
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
        log: req.log.child({ reqId: req.id }),
        ip: req.realIp,
        userAgent: req.headers["user-agent"]
      })
    });

    await server.register(registerRoutes, {
      smtp,
      queue,
      db,
      auditLogDb,
      keyStore,
      clickhouse,
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
