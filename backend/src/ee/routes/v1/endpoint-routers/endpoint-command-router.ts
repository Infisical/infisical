import { z } from "zod";

import {
  ENDPOINT_COMMAND_DEFAULT_TIMEOUT_SECONDS,
  ENDPOINT_COMMAND_MAX_ARG_LENGTH,
  ENDPOINT_COMMAND_MAX_ARGS,
  ENDPOINT_COMMAND_MAX_LENGTH,
  ENDPOINT_COMMAND_MAX_TIMEOUT_SECONDS,
  ENDPOINT_COMMAND_PAGE_SIZE_DEFAULT,
  ENDPOINT_COMMAND_PAGE_SIZE_MAX
} from "@app/ee/services/endpoint/endpoint-constants";
import { SanitizedEndpointCommandSchema } from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointCommandRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Queue a command for an Infisical Endpoint device to run",
      body: z.object({
        deviceId: z.string().uuid().describe("The device that should run the command."),
        command: z
          .string()
          .trim()
          .min(1)
          .max(ENDPOINT_COMMAND_MAX_LENGTH)
          .describe("The program to run, or the whole script when shell is true."),
        args: z
          .string()
          .max(ENDPOINT_COMMAND_MAX_ARG_LENGTH)
          .array()
          .max(ENDPOINT_COMMAND_MAX_ARGS)
          .default([])
          .describe("Arguments passed to the program. Ignored when shell is true."),
        shell: z
          .boolean()
          .default(false)
          .describe(
            "Run the command through the device's shell, so pipes, globs and redirection work. Off by default: without it the arguments cannot be read as shell syntax."
          ),
        timeoutSeconds: z.coerce
          .number()
          .int()
          .min(1)
          .max(ENDPOINT_COMMAND_MAX_TIMEOUT_SECONDS)
          .default(ENDPOINT_COMMAND_DEFAULT_TIMEOUT_SECONDS)
          .describe("How long the device may spend on it before the process is killed."),
        reason: z.string().trim().max(500).optional().describe("Why the command was run, kept with the record.")
      }),
      response: {
        201: z.object({ command: SanitizedEndpointCommandSchema })
      }
    },
    handler: async (req, res) => {
      const result = await server.services.endpointCommand.executeCommand(req.body, req.permission);
      void res.status(201);
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List commands queued for Infisical Endpoint devices, newest first",
      querystring: z.object({
        deviceId: z.string().uuid().optional().describe("Only return commands for this device."),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(ENDPOINT_COMMAND_PAGE_SIZE_MAX)
          .default(ENDPOINT_COMMAND_PAGE_SIZE_DEFAULT)
          .describe("How many commands to return."),
        cursor: z
          .string()
          .uuid()
          .optional()
          .describe("The nextCursor from the previous page. Omit for the first page.")
      }),
      response: {
        200: z.object({
          commands: SanitizedEndpointCommandSchema.array(),
          nextCursor: z.string().uuid().nullable()
        })
      }
    },
    handler: async (req) => {
      return server.services.endpointCommand.listCommands(req.query, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: "/:commandId",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Get one Infisical Endpoint command and whatever it has reported back",
      params: z.object({ commandId: z.string().uuid() }),
      response: {
        200: z.object({ command: SanitizedEndpointCommandSchema })
      }
    },
    handler: async (req) => {
      return server.services.endpointCommand.getCommand(req.params, req.permission);
    }
  });

  // A sub-path rather than a PATCH of status: cancelling is only legal from one state and only
  // before the device picks the command up, which a general status field would not convey.
  server.route({
    method: "POST",
    url: "/:commandId/cancel",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Cancel a queued Infisical Endpoint command the device has not picked up yet",
      params: z.object({ commandId: z.string().uuid() }),
      response: {
        200: z.object({ command: SanitizedEndpointCommandSchema })
      }
    },
    handler: async (req) => {
      return server.services.endpointCommand.cancelCommand(req.params, req.permission);
    }
  });
};
