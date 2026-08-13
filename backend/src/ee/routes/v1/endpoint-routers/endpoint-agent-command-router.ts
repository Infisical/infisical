import { z } from "zod";

import {
  ENDPOINT_COMMAND_MAX_LENGTH,
  ENDPOINT_COMMAND_MAX_OUTPUT_BYTES
} from "@app/ee/services/endpoint/endpoint-constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointAgentCommandRouter = async (server: FastifyZodProvider) => {
  // POST rather than GET even though the agent is asking for work: it moves every command it returns
  // to Dispatched, so it is not safe and must not be retried or prefetched as if it were. RPC-shaped
  // for the same reason the heartbeat is — this is the agent's work queue, not a resource listing.
  server.route({
    method: "POST",
    url: "/commands/claim",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      response: {
        200: z.object({
          commands: z
            .object({
              id: z.string().uuid(),
              shell: z.boolean(),
              command: z.string(),
              args: z.string().array(),
              timeoutSeconds: z.number(),
              // Sent rather than compiled into the agent so the cap can move without every device
              // needing a new binary to respect it.
              maxOutputBytes: z.number()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      return server.services.endpointCommand.claimCommands(req.permission);
    }
  });

  server.route({
    method: "POST",
    url: "/commands/:commandId/result",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      params: z.object({ commandId: z.string().uuid() }),
      body: z.object({
        // Absent when the agent never managed to start the process, which 'error' then explains.
        exitCode: z.number().int().min(-256).max(256).optional(),
        // Bounded at the same cap the agent is handed, so an agent that ignores it is rejected here
        // rather than writing an unbounded row.
        stdout: z.string().max(ENDPOINT_COMMAND_MAX_OUTPUT_BYTES).optional(),
        stderr: z.string().max(ENDPOINT_COMMAND_MAX_OUTPUT_BYTES).optional(),
        outputTruncated: z.boolean().default(false),
        timedOut: z.boolean().default(false),
        error: z.string().max(ENDPOINT_COMMAND_MAX_LENGTH).optional()
      }),
      response: {
        200: z.object({
          // Null when the command was canceled, already reported, or belongs to another device. The
          // agent has nothing to retry in any of those cases, so it is not an error.
          accepted: z.boolean()
        })
      }
    },
    handler: async (req) => {
      const { command } = await server.services.endpointCommand.reportCommandResult(
        { commandId: req.params.commandId, ...req.body },
        req.permission
      );

      return { accepted: Boolean(command) };
    }
  });
};
