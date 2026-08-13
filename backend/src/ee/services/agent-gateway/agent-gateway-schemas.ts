import { z } from "zod";

import { AgentGatewayUnmatchedHostPolicy } from "./agent-gateway-enums";

// The transport is flattened into a nested object with health already decided, so a client never has to
// re-derive "reachable" from a heartbeat pair. supportsAgentProxy comes from the gateway's reported
// capabilities and is what lets a picker grey out a gateway whose CLI is too old.
export const allowedHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(255)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/,
    "Enter a hostname such as www.google.com. Wildcards and paths are not supported here, because the match is exact."
  );

export const SanitizedAgentGatewayGatewaySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isHealthy: z.boolean(),
  supportsAgentProxy: z.boolean()
});

export const SanitizedAgentGatewayPoolSchema = z.object({
  id: z.string().uuid(),
  name: z.string()
});

export const SanitizedAgentGatewaySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  projectId: z.string(),
  isLocalModeEnabled: z.boolean(),
  unmatchedHostPolicy: z.nativeEnum(AgentGatewayUnmatchedHostPolicy),
  allowedHosts: z.string().array(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  gateway: SanitizedAgentGatewayGatewaySchema.nullable(),
  gatewayPool: SanitizedAgentGatewayPoolSchema.nullable()
});

// Ordered by priority: it is the tie-break the broker applies when two services match the same host.
export const SanitizedLinkedProxiedServiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hostPattern: z.string(),
  isEnabled: z.boolean(),
  priority: z.number(),
  lastUsedAt: z.date().nullable().optional()
});

export const AgentGatewayWithServicesSchema = SanitizedAgentGatewaySchema.extend({
  proxiedServices: SanitizedLinkedProxiedServiceSchema.array()
});

export const AgentGatewayListItemSchema = SanitizedAgentGatewaySchema.extend({
  proxiedServiceCount: z.number(),
  // Principals on the access list: users, machine identities and groups. A group counts once, not by size,
  // because it is one grant.
  accessCount: z.number()
});
