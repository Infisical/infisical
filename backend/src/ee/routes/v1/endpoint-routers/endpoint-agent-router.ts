import { z } from "zod";

import {
  EndpointDestinationKind,
  EndpointDeviceStatus,
  EndpointEventType,
  EndpointNetworkRuleAction,
  EndpointTargetKind
} from "@app/ee/services/endpoint/endpoint-enums";
import { EndpointDestinationSchema } from "@app/ee/services/endpoint/endpoint-schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const MAX_EVENTS_PER_BATCH = 100;
const MAX_COUNTERS_PER_HEARTBEAT = 100;
// A counter list is filtered down to what is near a threshold; a transfer list is every destination
// the device reached in the last second or two, so it is allowed to be longer.
const MAX_TRANSFERS_PER_HEARTBEAT = 200;
const MAX_BLOCKED_ADDRESSES = 1000;
// Every device fact is a short label a system tool printed, so one bound covers all of them.
const DeviceFactSchema = z.string().trim().max(128).optional();
const MAX_CPU_CORES = 4096;

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
    // Empty until CIDR targets exist, which need a TUN device on the agent. See the service.
    assignedCidrs: z.string().array(),
    // One entry per target this device may reach. 'ip' is the address the device listens on for it:
    // a loopback address the agent claims for a domain target, or the target's own address for an IP
    // target, which has no domain and needs no /etc/hosts entry.
    hostEntries: z
      .object({
        targetId: z.string().uuid(),
        name: z.string(),
        kind: z.nativeEnum(EndpointTargetKind),
        domain: z.string(),
        ip: z.string(),
        port: z.number()
      })
      .array(),
    gateway: z.null()
  })
});

// Mirrors TGatewayV2ConnectionDetails. The agent feeds these straight into the same relay and
// gateway dial the PAM proxies use.
const AgentTargetConnectionSchema = z.object({
  relayHost: z.string(),
  gateway: z.object({
    clientCertificate: z.string(),
    clientPrivateKey: z.string(),
    serverCertificateChain: z.string()
  }),
  relay: z.object({
    clientCertificate: z.string(),
    clientPrivateKey: z.string(),
    serverCertificateChain: z.string()
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
        // How much went to each destination since the last heartbeat. Nullish rather than optional:
        // an older agent omits the field, and a current one with nothing to report sends an explicit
        // null, because Go marshals an empty slice that way. Both mean "no transfers this interval".
        transfers: z
          .object({
            destination: EndpointDestinationSchema,
            bytesOut: z.number().int().nonnegative()
          })
          .array()
          .max(MAX_TRANSFERS_PER_HEARTBEAT)
          .nullish(),
        // Absent on most heartbeats: the agent re-reports what the machine is on a slow timer, so an
        // omitted object means "unchanged", and every field inside is optional because a platform
        // that cannot answer one still reports the others.
        device: z
          .object({
            hostname: DeviceFactSchema,
            platform: DeviceFactSchema,
            arch: DeviceFactSchema,
            osName: DeviceFactSchema,
            osVersion: DeviceFactSchema,
            osBuild: DeviceFactSchema,
            modelIdentifier: DeviceFactSchema,
            cpuModel: DeviceFactSchema,
            cpuCores: z.number().int().min(1).max(MAX_CPU_CORES).optional(),
            memoryBytes: z.number().int().nonnegative().optional(),
            serialNumber: DeviceFactSchema,
            ipAddress: z.string().trim().ip().optional(),
            bootedAt: z.string().datetime().optional()
          })
          .optional(),
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

  // Called once per connection the device opens to a private target, because the certificate this
  // returns lives five minutes. RPC-shaped for the same reason the heartbeat is: it mints a
  // short-lived credential for one dial rather than creating a resource anyone can read back.
  server.route({
    method: "POST",
    url: "/targets/:targetId/connect",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      params: z.object({ targetId: z.string().uuid() }),
      response: {
        200: z.object({ connection: AgentTargetConnectionSchema })
      }
    },
    handler: async (req) => {
      const connection = await server.services.endpoint.connectTarget(req.params, req.permission);
      return { connection };
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
