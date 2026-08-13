import { z } from "zod";

import { EndpointTargetKind } from "@app/ee/services/endpoint/endpoint-enums";
import {
  assertTargetMatchesKind,
  EndpointDestinationSchema,
  SanitizedEndpointTargetSchema
} from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const PortSchema = z.number().int().min(1).max(65535);

const KindDescription =
  "'domain' publishes a hostname the device resolves to a local listener. 'ip' claims a single private IPv4 address on the device itself.";

const DeviceIdsSchema = z
  .string()
  .uuid()
  .array()
  .describe("The devices allowed to reach this target. Devices not listed cannot reach it at all.");

export const registerEndpointTargetRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List the private-access targets in this organization",
      response: {
        200: z.object({ targets: SanitizedEndpointTargetSchema.array() })
      }
    },
    handler: async (req) => {
      const targets = await server.services.endpoint.listTargets(req.permission);
      return { targets };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Create a private-access target",
      body: z
        .object({
          name: GenericResourceNameSchema.describe("A name for the target, shown in the console and on events."),
          kind: z.nativeEnum(EndpointTargetKind).describe(KindDescription),
          destination: EndpointDestinationSchema.describe(
            "The hostname or IPv4 address the person on the device uses to reach the service."
          ),
          ip: EndpointDestinationSchema.optional().describe(
            "Domain targets only, and only when the gateway's own DNS cannot resolve the destination: the address the gateway should dial instead."
          ),
          port: PortSchema.describe("The port the service listens on behind the gateway."),
          gatewayId: z.string().uuid().describe("The gateway the traffic is tunnelled through."),
          isEnabled: z
            .boolean()
            .optional()
            .describe("Disabled targets stay in the console but reach no device. Defaults to true."),
          deviceIds: DeviceIdsSchema.optional()
        })
        .superRefine(assertTargetMatchesKind),
      response: {
        200: z.object({ target: SanitizedEndpointTargetSchema })
      }
    },
    handler: async (req) => {
      const target = await server.services.endpoint.createTarget(req.body, req.permission);
      return { target };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:targetId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Update a private-access target",
      params: z.object({
        targetId: z.string().uuid().describe("The ID of the target to update.")
      }),
      body: z
        .object({
          name: GenericResourceNameSchema.optional().describe("A name for the target."),
          kind: z.nativeEnum(EndpointTargetKind).optional().describe(KindDescription),
          destination: EndpointDestinationSchema.optional().describe(
            "The hostname or IPv4 address the person on the device uses."
          ),
          ip: EndpointDestinationSchema.nullish().describe(
            "Domain targets only: the address the gateway should dial. Send null to clear it."
          ),
          port: PortSchema.optional().describe("The port the service listens on behind the gateway."),
          gatewayId: z.string().uuid().optional().describe("The gateway the traffic is tunnelled through."),
          isEnabled: z.boolean().optional().describe("Whether devices should be granted this target."),
          deviceIds: DeviceIdsSchema.optional().describe(
            "Replaces the whole set of devices allowed to reach this target."
          )
        })
        .superRefine((body, ctx) => {
          // kind decides how destination is read, and it also decides how the device provisions the
          // address it listens on, so neither can be changed without the other.
          if ((body.kind === undefined) !== (body.destination === undefined)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["destination"],
              message: "'kind' and 'destination' must be updated together, so the destination is validated correctly."
            });
            return;
          }
          if (body.kind && body.destination) {
            assertTargetMatchesKind({ kind: body.kind, destination: body.destination, ip: body.ip }, ctx);
          }
        }),
      response: {
        200: z.object({ target: SanitizedEndpointTargetSchema })
      }
    },
    handler: async (req) => {
      const target = await server.services.endpoint.updateTarget(
        { targetId: req.params.targetId, ...req.body },
        req.permission
      );
      return { target };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:targetId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Delete a private-access target",
      params: z.object({
        targetId: z.string().uuid().describe("The ID of the target to delete.")
      }),
      response: {
        200: z.object({ target: SanitizedEndpointTargetSchema })
      }
    },
    handler: async (req) => {
      const target = await server.services.endpoint.deleteTarget(req.params, req.permission);
      return { target };
    }
  });
};
