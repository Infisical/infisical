import { z } from "zod";

import { EndpointScanTrigger } from "@app/ee/services/endpoint/endpoint-scan-enums";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// A device that has gone unscanned for a while can legitimately have a lot of findings, but a payload
// beyond this is a misconfigured root rather than a useful report. The agent applies the same cap and
// sets `truncated` when it bites.
const MAX_FINDINGS_PER_SCAN = 500;
const MAX_ROOTS = 50;

// Kept separate from the agent's config and heartbeat routes so scanning and network control stay
// independent of one another.
export const registerEndpointAgentScanRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/scan-policy",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      response: {
        200: z.object({
          policy: z.object({
            enabled: z.boolean(),
            roots: z.string().array(),
            excludePatterns: z.string().array(),
            maxFileMegabytes: z.number(),
            intervalHours: z.number(),
            // Empty when no scan has ever been requested for this device. A changed value is what tells
            // the agent to scan now.
            scanRequestId: z.string()
          })
        })
      }
    },
    handler: async (req) => {
      return server.services.endpointScan.getAgentScanPolicy(req.permission);
    }
  });

  server.route({
    method: "POST",
    url: "/scan-results",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      body: z.object({
        result: z.object({
          scanRequestId: z.string().optional(),
          trigger: z.nativeEnum(EndpointScanTrigger),
          startedAt: z.string().datetime(),
          finishedAt: z.string().datetime(),
          rootsScanned: z.string().array().max(MAX_ROOTS),
          inaccessibleRoots: z.string().array().max(MAX_ROOTS).optional(),
          filesScanned: z.number().int().nonnegative(),
          truncated: z.boolean(),
          findings: z
            .object({
              fingerprint: z.string().trim().min(1),
              ruleId: z.string().trim().min(1),
              description: z.string().optional(),
              file: z.string().trim().min(1),
              startLine: z.number().int().nonnegative(),
              entropy: z.number().optional(),
              // The agent redacts on the device, so this is the matched line with the credential already
              // replaced. There is no field here for a secret value, by design.
              redactedMatch: z.string().optional(),
              fileModifiedAt: z.string().datetime().optional()
            })
            .array()
            .max(MAX_FINDINGS_PER_SCAN)
        })
      }),
      response: {
        200: z.object({ acceptedCount: z.number() })
      }
    },
    handler: async (req) => {
      const { acceptedCount } = await server.services.endpointScan.reportScanResult(req.body, req.permission);
      return { acceptedCount };
    }
  });
};
