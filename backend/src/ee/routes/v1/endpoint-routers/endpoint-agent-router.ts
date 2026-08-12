import { z } from "zod";

import {
  EndpointDestinationKind,
  EndpointDeviceStatus,
  EndpointEventType,
  EndpointNetworkRuleAction
} from "@app/ee/services/endpoint/endpoint-enums";
import { EndpointDestinationSchema } from "@app/ee/services/endpoint/endpoint-schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const MAX_EVENTS_PER_BATCH = 100;
const MAX_COUNTERS_PER_HEARTBEAT = 100;
const MAX_BLOCKED_ADDRESSES = 1000;

const AgentConfigSchema = z.object({
  device: z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.nativeEnum(EndpointDeviceStatus)
  }),
  configVersion: z.number(),
  pollIntervalSeconds: z.number(),
  networkPolicy: z.object({
    enabled: z.boolean(),
    destinationRules: z
      .object({
        id: z.string().uuid(),
        action: z.nativeEnum(EndpointNetworkRuleAction),
        kind: z.nativeEnum(EndpointDestinationKind),
        destination: z.string(),
        name: z.string()
      })
      .array(),
    // A volume rule carries no destination: it applies to every destination the device sends to, and
    // the agent discovers those from its own traffic rather than being told them here. The threshold is
    // a rate, so the window travels with it.
    volumeRules: z
      .object({
        id: z.string().uuid(),
        // Coerced because this value originates in a bigint column; see the mapper in the service.
        thresholdBytes: z.coerce.number(),
        windowSeconds: z.number(),
        name: z.string()
      })
      .array()
  }),
  privateAccess: z.object({
    enabled: z.boolean(),
    assignedCidrs: z.string().array(),
    hostEntries: z.object({ domain: z.string(), ip: z.string() }).array(),
    gateway: z.null()
  })
});

export const registerEndpointAgentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/config",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      response: {
        200: z.object({ config: AgentConfigSchema })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.getAgentConfig(req.permission);
    }
  });

  // RPC-shaped telemetry ingest rather than resource CRUD, and it answers with a config-version
  // pointer instead of the created resource. Deliberate: it keeps the agent on one 1Hz call instead
  // of a second poll loop, and it is how telemetry ingest is normally modelled.
  server.route({
    method: "POST",
    url: "/heartbeat",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      body: z.object({
        agentVersion: z.string().trim().min(1).max(32),
        configVersion: z.number().int().nonnegative(),
        counters: z
          .object({
            volumeRuleId: z.string().uuid(),
            destination: EndpointDestinationSchema,
            bytesOut: z.number().int().nonnegative(),
            thresholdBytes: z.number().int().nonnegative(),
            tripped: z.boolean()
          })
          .array()
          .max(MAX_COUNTERS_PER_HEARTBEAT),
        enforcement: z.object({
          pfEnabled: z.boolean(),
          blockedAddresses: EndpointDestinationSchema.array().max(MAX_BLOCKED_ADDRESSES)
        })
      }),
      response: {
        200: z.object({ device: z.object({ configVersion: z.number() }) })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.heartbeat(req.body, req.permission);
    }
  });

  server.route({
    method: "POST",
    url: "/events",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      body: z.object({
        events: z
          .object({
            idempotencyKey: z.string().uuid(),
            type: z.nativeEnum(EndpointEventType),
            occurredAt: z.string().datetime(),
            destination: EndpointDestinationSchema.nullish(),
            ruleId: z.string().uuid().nullish(),
            detail: z.record(z.unknown()).nullish()
          })
          .array()
          .min(1)
          .max(MAX_EVENTS_PER_BATCH)
      }),
      response: {
        200: z.object({ acceptedCount: z.number() })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.reportEvents(req.body, req.permission);
    }
  });
};
