import { FastifyRequest } from "fastify";
import { z } from "zod";

import {
  AgentVaultHookRuleSchema,
  AgentVaultHookServiceNarrowingUpdateSchema,
  THookRuleNarrowing
} from "@app/ee/services/agent-vault-hook/agent-vault-hook-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { actorContext, resolveRequestedProjectId } from "./agent-vault-router-fns";
import {
  AgentVaultCreateHookBodySchema,
  agentVaultListQuery,
  AgentVaultHookSchema,
  AgentVaultHookServiceLinkSchema,
  AgentVaultProjectIdSchema,
  AgentVaultUpdateHookBodySchema
} from "./agent-vault-schemas";

const HookIdParamsSchema = z.object({
  hookId: z.string().uuid().describe(AGENT_VAULT.HOOK.hookId)
});

const HookServiceParamsSchema = HookIdParamsSchema.extend({
  serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId)
});

type THookServiceEdit = {
  hook: { id: string; name: string };
  service: { id: string; name: string };
} & THookRuleNarrowing;

const toHookServiceLink = ({ hook, service, ...narrowing }: THookServiceEdit) => ({
  hookId: hook.id,
  hookName: hook.name,
  serviceId: service.id,
  service: service.name,
  ...narrowing
});

export const registerAgentVaultHookRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultHook",
      description:
        "Save a hook in an Agent Vault project: a server of yours that the proxy asks before it sends a session's requests. A session uses it only when it is started with its `hookId`.",
      tags: [ApiDocsTags.AgentVaultHooks],
      body: AgentVaultCreateHookBodySchema.extend({ projectId: AgentVaultProjectIdSchema }),
      response: { 200: z.object({ hook: AgentVaultHookSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      const { hook } = await server.services.agentVaultHook.createHook({
        ...body,
        projectId,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_HOOK_CREATE,
          metadata: {
            hookId: hook.id,
            hookName: hook.name,
            url: hook.url,
            ruleCount: hook.rules.length
          }
        }
      });

      return { hook };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultHooks",
      description:
        "List the saved hooks in an Agent Vault project, ordered by name. A hook's secret is never returned.",
      tags: [ApiDocsTags.AgentVaultHooks],
      querystring: z.object({
        projectId: AgentVaultProjectIdSchema,
        ...agentVaultListQuery(AGENT_VAULT.HOOK)
      }),
      response: {
        200: z.object({
          hooks: AgentVaultHookSchema.array(),
          totalCount: z.number().describe(AGENT_VAULT.HOOK.totalCount)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...query } = req.query;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "query");
      return server.services.agentVaultHook.listHooks({ projectId, ctx: actorContext(req), ...query });
    }
  });

  server.route({
    method: "GET",
    url: "/:hookId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultHook",
      description: "Get a saved hook in an Agent Vault project. Its secret is never returned.",
      tags: [ApiDocsTags.AgentVaultHooks],
      params: HookIdParamsSchema,
      response: { 200: z.object({ hook: AgentVaultHookSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromHook(
        actorContext(req),
        req.params.hookId
      );
      return server.services.agentVaultHook.getHook({ projectId, ctx: actorContext(req), hookId: req.params.hookId });
    }
  });

  server.route({
    method: "PATCH",
    url: "/:hookId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultHook",
      description:
        "Update a saved hook. Fields left out keep their values, and leaving out `secret` keeps the saved one. Sessions using the hook pick up the change on the proxy's next poll.",
      tags: [ApiDocsTags.AgentVaultHooks],
      params: HookIdParamsSchema,
      body: AgentVaultUpdateHookBodySchema,
      response: { 200: z.object({ hook: AgentVaultHookSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromHook(
        actorContext(req),
        req.params.hookId
      );
      const { hook, secretReplaced } = await server.services.agentVaultHook.updateHook({
        ...req.body,
        projectId,
        ctx: actorContext(req),
        hookId: req.params.hookId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_HOOK_UPDATE,
          // Every field comes off the body, so an absent one means the PATCH did not touch it.
          metadata: {
            hookId: hook.id,
            hookName: hook.name,
            name: req.body.name,
            description: req.body.description,
            url: req.body.url,
            ruleCount: req.body.rules?.length,
            secretReplaced
          }
        }
      });

      return { hook };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:hookId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultHook",
      description:
        "Delete a saved hook. Sessions that were started with it keep running without a hook from the proxy's next poll.",
      tags: [ApiDocsTags.AgentVaultHooks],
      params: HookIdParamsSchema,
      response: { 200: z.object({ hook: AgentVaultHookSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromHook(
        actorContext(req),
        req.params.hookId
      );
      const { hook } = await server.services.agentVaultHook.deleteHook({
        projectId,
        ctx: actorContext(req),
        hookId: req.params.hookId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_HOOK_DELETE,
          metadata: { hookId: hook.id, hookName: hook.name, url: hook.url }
        }
      });

      return { hook };
    }
  });

  const auditHookServiceChange = async (
    req: FastifyRequest,
    projectId: string,
    change: "added" | "removed" | "narrowed",
    { hook, service, ...narrowing }: THookServiceEdit
  ) =>
    server.services.auditLog.createAuditLog({
      ...req.auditLogInfo,
      orgId: req.permission.orgId,
      projectId,
      event: {
        type: EventType.AGENT_VAULT_HOOK_UPDATE,
        metadata: {
          hookId: hook.id,
          hookName: hook.name,
          serviceChange: { change, serviceId: service.id, serviceName: service.name, ...narrowing },
          secretReplaced: false
        }
      }
    });

  server.route({
    method: "POST",
    url: "/:hookId/services",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addAgentVaultHookService",
      description:
        "Add one of the project's services to a saved hook, optionally narrowed to some methods and paths (HTTP) or tools (MCP). A hook that asked about every request asks only about its services from then on. Sessions using the hook pick up the change on the proxy's next poll.",
      tags: [ApiDocsTags.AgentVaultHooks],
      params: HookIdParamsSchema,
      body: AgentVaultHookRuleSchema,
      response: { 200: z.object({ link: AgentVaultHookServiceLinkSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromHook(
        actorContext(req),
        req.params.hookId
      );
      const edit = await server.services.agentVaultHook.addHookService({
        ...req.body,
        projectId,
        ctx: actorContext(req),
        hookId: req.params.hookId
      });
      await auditHookServiceChange(req, projectId, "added", edit);
      return { link: toHookServiceLink(edit) };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:hookId/services/:serviceId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultHookService",
      description:
        "Change which of a service's requests a saved hook is asked about. Fields left out keep their values, and null removes one so the hook matches every method, path or tool.",
      tags: [ApiDocsTags.AgentVaultHooks],
      params: HookServiceParamsSchema,
      body: AgentVaultHookServiceNarrowingUpdateSchema,
      response: { 200: z.object({ link: AgentVaultHookServiceLinkSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromHook(
        actorContext(req),
        req.params.hookId
      );
      const edit = await server.services.agentVaultHook.updateHookService({
        ...req.body,
        projectId,
        ctx: actorContext(req),
        hookId: req.params.hookId,
        serviceId: req.params.serviceId
      });
      await auditHookServiceChange(req, projectId, "narrowed", edit);
      return { link: toHookServiceLink(edit) };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:hookId/services/:serviceId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeAgentVaultHookService",
      description:
        "Remove a service from a saved hook. The service stays in the project. A hook left with no services is not asked about any request until one is added.",
      tags: [ApiDocsTags.AgentVaultHooks],
      params: HookServiceParamsSchema,
      response: { 200: z.object({ link: AgentVaultHookServiceLinkSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromHook(
        actorContext(req),
        req.params.hookId
      );
      const edit = await server.services.agentVaultHook.removeHookService({
        projectId,
        ctx: actorContext(req),
        hookId: req.params.hookId,
        serviceId: req.params.serviceId
      });
      await auditHookServiceChange(req, projectId, "removed", edit);
      return { link: toHookServiceLink(edit) };
    }
  });
};
