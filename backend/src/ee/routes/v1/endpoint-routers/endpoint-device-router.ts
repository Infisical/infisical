import { z } from "zod";

import {
  EndpointDeviceWithLivenessSchema,
  SanitizedEndpointDeviceSchema
} from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointDeviceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List the Infisical Endpoint devices registered in the organization",
      response: {
        200: z.object({ devices: EndpointDeviceWithLivenessSchema.array() })
      }
    },
    handler: async (req) => {
      const devices = await server.services.endpoint.listDevices(req.permission);
      return { devices };
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
      description: "Register a company device with Infisical Endpoint and assign it to its owner",
      body: z.object({
        userId: z
          .string()
          .uuid()
          .describe(
            "The ID of the organization member this device belongs to. The agent on the device signs in as this person."
          ),
        name: GenericResourceNameSchema.describe("A name for the device, shown throughout the console.")
      }),
      response: {
        200: z.object({ device: EndpointDeviceWithLivenessSchema })
      }
    },
    handler: async (req) => {
      const device = await server.services.endpoint.registerDevice(req.body, req.permission);
      return { device };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:deviceId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Remove a device from Infisical Endpoint",
      params: z.object({
        deviceId: z.string().uuid().describe("The ID of the device to remove.")
      }),
      response: {
        200: z.object({ device: SanitizedEndpointDeviceSchema })
      }
    },
    handler: async (req) => {
      const device = await server.services.endpoint.deleteDevice(req.params, req.permission);
      return { device };
    }
  });
};
