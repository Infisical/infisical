import { z } from "zod";

import {
  EndpointScanPolicyResponseSchema,
  SanitizedEndpointDeviceScanSchema,
  SanitizedEndpointSecretFindingSchema
} from "@app/ee/services/endpoint/endpoint-scan-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const MAX_ROOTS = 50;
const MAX_EXCLUDE_PATTERNS = 100;

// A scan reads files, so a root has to be an absolute path or '~'. Accepting a relative path would
// silently resolve against whatever directory the agent happens to be running in.
const ScanRootSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => value === "~" || value.startsWith("~/") || value.startsWith("/"), {
    message: "A folder must be an absolute path such as /Users/alice/Desktop, or start with ~ for the user's home."
  });

export const registerEndpointScanRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/policy",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Get the secret scanning policy every Infisical Endpoint device in this organization follows",
      response: {
        200: z.object({ policy: EndpointScanPolicyResponseSchema })
      }
    },
    handler: async (req) => {
      return server.services.endpointScan.getScanPolicy(req.permission);
    }
  });

  server.route({
    method: "PATCH",
    url: "/policy",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Update the secret scanning policy",
      body: z.object({
        isEnabled: z.boolean().describe("Whether devices scan for credentials stored in files."),
        roots: ScanRootSchema.array()
          .max(MAX_ROOTS)
          .describe("The folders each device scans. '~' resolves to the home directory of the device's owner."),
        excludePatterns: z
          .string()
          .trim()
          .max(512)
          .array()
          .max(MAX_EXCLUDE_PATTERNS)
          .default([])
          .describe(
            "Regular expressions matched against the full path. Anything matching is skipped, on top of the built-in exclusions."
          ),
        maxFileMegabytes: z
          .number()
          .int()
          .positive()
          .max(64)
          .optional()
          .describe("Files larger than this are skipped. Credentials live in small files."),
        intervalHours: z
          .number()
          .int()
          .positive()
          .max(720)
          .default(24)
          .describe("How often a device scans on its own, in hours.")
      }),
      response: {
        200: z.object({ policy: EndpointScanPolicyResponseSchema })
      }
    },
    handler: async (req) => {
      return server.services.endpointScan.updateScanPolicy(req.body, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: "/findings",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List credentials found in files on Infisical Endpoint devices",
      querystring: z.object({
        deviceId: z.string().uuid().optional().describe("Only return findings from this device.")
      }),
      response: {
        200: z.object({ findings: SanitizedEndpointSecretFindingSchema.array() })
      }
    },
    handler: async (req) => {
      return server.services.endpointScan.listFindings(req.query, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: "/device-scans",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List the most recent secret scan each Infisical Endpoint device ran",
      response: {
        200: z.object({ deviceScans: SanitizedEndpointDeviceScanSchema.array() })
      }
    },
    handler: async (req) => {
      return server.services.endpointScan.listDeviceScans(req.permission);
    }
  });

  server.route({
    method: "POST",
    url: "/devices/:deviceId/request",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Ask a device to scan for credentials now, without waiting for its schedule",
      params: z.object({
        deviceId: z.string().uuid()
      }),
      response: {
        200: z.object({ deviceScan: SanitizedEndpointDeviceScanSchema.omit({ deviceName: true }) })
      }
    },
    handler: async (req) => {
      return server.services.endpointScan.requestScan(req.params, req.permission);
    }
  });
};
