import { monitorEventLoopDelay } from "perf_hooks";
import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { readLimit } from "@app/server/config/rateLimiter";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

export const registerStatusRoute = (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/api/status",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getInstanceStatus",
      tags: [ApiDocsTags.Instance],
      description:
        "Get the status of the Infisical instance and the features configured on it. Public and unauthenticated; used by liveness and readiness probes and exempt from the API-wide rate limit.",
      response: {
        200: z.object({
          date: z.date(),
          message: z.string().optional(),
          emailConfigured: z.boolean().optional(),
          inviteOnlySignup: z.boolean().optional(),
          redisConfigured: z.boolean().optional(),
          secretScanningConfigured: z.boolean().optional(),
          samlDefaultOrgSlug: z.string().optional(),
          auditLogStorageDisabled: z.boolean().optional(),
          maxIdentityAccessTokenTTL: z.number().optional()
        })
      }
    },
    handler: async () => {
      const cfg = getConfig();
      const serverCfg = await getServerCfg();

      const meanLagMs = histogram.mean / 1e6;
      const maxLagMs = histogram.max / 1e6;
      const p99LagMs = histogram.percentile(99) / 1e6;

      logger.info(
        `Event loop stats - Mean: ${meanLagMs.toFixed(2)}ms, Max: ${maxLagMs.toFixed(2)}ms, p99: ${p99LagMs.toFixed(
          2
        )}ms`
      );

      logger.info(`Raw event loop stats: ${JSON.stringify(histogram, null, 2)}`);

      return {
        date: new Date(),
        message: "Ok",
        emailConfigured: cfg.isSmtpConfigured,
        inviteOnlySignup: Boolean(serverCfg.allowSignUp),
        redisConfigured: cfg.isRedisConfigured,
        secretScanningConfigured: cfg.isSecretScanningConfigured,
        samlDefaultOrgSlug: cfg.samlDefaultOrgSlug,
        auditLogStorageDisabled: Boolean(cfg.DISABLE_POSTGRES_AUDIT_LOG_STORAGE),
        maxIdentityAccessTokenTTL: cfg.MAX_MACHINE_IDENTITY_TOKEN_AGE
      };
    }
  });
};
