import { ForbiddenError } from "@casl/ability";
import { McpServer, StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { OrganizationActionScope } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import {
  BadRequestError,
  ConflictError,
  ForbiddenRequestError,
  NotFoundError,
  UnauthorizedError
} from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { isScopeNarrowedRequest } from "@app/lib/request-context/oauth-delegation";
import { getPermissionDenialDetails } from "@app/server/plugins/audit-log-permission-denied";
import { TPostHogEvent } from "@app/services/telemetry/telemetry-types";

export const ProjectIdSchema = z.string().trim().min(1).max(36).describe("The project ID, from list-projects.");

// The SDK validates arguments through Standard Schema, which zod 3 implements, and advertises them in tools/list
// as JSON Schema, which zod 3 cannot produce on its own.
const $toToolInput = <T extends z.ZodTypeAny>(schema: T) => {
  // Every field written out in full: a schema reused for two fields would otherwise become a $ref, which some clients
  // do not follow.
  const jsonSchema = () =>
    zodToJsonSchema(schema, { $refStrategy: "none", pipeStrategy: "input" }) as Record<string, unknown>;
  return {
    "~standard": { ...schema["~standard"], jsonSchema: { input: jsonSchema, output: jsonSchema } }
  } as StandardSchemaWithJSON<z.input<T>, z.output<T>>;
};

const $getToolErrorMessage = (error: unknown, toolName: string, actorId: string) => {
  if (error instanceof PermissionDeniedError && error.denial) {
    return `You are not allowed to ${error.denial.action} on ${error.denial.subject}`;
  }
  if (error instanceof ForbiddenError) return `You are not allowed to ${error.action} on ${error.subjectType}`;
  if (
    error instanceof BadRequestError ||
    error instanceof NotFoundError ||
    error instanceof ForbiddenRequestError ||
    error instanceof UnauthorizedError ||
    error instanceof ConflictError
  ) {
    return error.message;
  }

  logger.error(error, `MCP tool call failed [tool=${toolName}] [actorId=${actorId}]`);
  return "Something went wrong while running this tool. Try again, and contact support if it keeps happening.";
};

// What every product's tools get: the caller, the scopes they were granted, and the helpers that keep each tool
// audited, narrowed by its scopes and safe to report errors from.
export const createMcpToolContext = (
  server: FastifyZodProvider,
  req: FastifyRequest,
  mcpServer: McpServer,
  scopes: string[]
) => {
  const actor = { actor: req.actor };
  const auditLogInfo = { ...req.auditLogInfo, userAgentType: UserAgentType.REMOTE_MCP };

  // Analytics must never turn a tool call that already succeeded into an error.
  const sendEvent = async (event: TPostHogEvent) => {
    try {
      await server.services.telemetry.sendPostHogEvents(event);
    } catch (error) {
      logger.error(error, `Failed to send MCP analytics event [event=${event.event}] [actorId=${req.actor.id}]`);
    }
  };

  const registerTool = <T extends z.ZodTypeAny>(
    name: string,
    config: { description: string; inputSchema: T; annotations: ToolAnnotations },
    run: (args: z.output<T>) => Promise<unknown>
  ) => {
    mcpServer.registerTool(name, { ...config, inputSchema: $toToolInput(config.inputSchema) }, async (args) => {
      try {
        // Scopes narrow a delegated token through the request context. Refuse rather than run unnarrowed if a
        // change in how the SDK dispatches tools ever loses it.
        if (!isScopeNarrowedRequest()) {
          throw new Error("OAuth scopes missing from the request context");
        }

        // The same check consent ran, repeated because a connection outlives it: it refuses a user who has left the org
        // or no longer meets its SSO enforcement. Not every tool reaches a permission check of its own (list-projects).
        await server.services.orgPermissionService.getOrgPermission({
          actor: req.actor,
          scope: OrganizationActionScope.ParentOrganization
        });

        return { content: [{ type: "text" as const, text: JSON.stringify(await run(args)) }] };
      } catch (error) {
        // The error never reaches the route's onError hook, which records denials for REST routes. Unlike that hook,
        // a ForbiddenRequestError counts: in a tool it is always a refusal of what the user asked for, such as
        // create-project without the org permission or a tool the connection's scopes don't cover.
        const denial =
          getPermissionDenialDetails(error) ??
          (error instanceof ForbiddenRequestError ? { errorName: error.name } : undefined);
        if (denial) {
          void server.services.auditLog.recordPermissionDenied({
            ...auditLogInfo,
            orgId: req.actor.orgId,
            projectId: (args as { projectId?: string }).projectId,
            metadata: { ...denial, route: `MCP tool ${name}`, method: req.method }
          });
        }

        return {
          content: [{ type: "text" as const, text: $getToolErrorMessage(error, name, req.actor.id) }],
          isError: true
        };
      }
    });
  };

  return { server, req, scopes, actor, auditLogInfo, sendEvent, registerTool };
};

export type TMcpToolContext = ReturnType<typeof createMcpToolContext>;
