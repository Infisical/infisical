import { z } from "zod";

import { hostPatternSchema } from "@app/ee/services/proxied-service/proxied-service-schemas";
import {
  listSandboxIntegrations,
  SANDBOX_AGENTS,
  SandboxAgentType,
  SandboxCredentialRole,
  SandboxIntegrationType,
  SandboxSubstitutionSurface
} from "@app/ee/services/sandbox/sandbox-integrations";
import { SandboxStatus } from "@app/ee/services/sandbox/sandbox-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SandboxIdParamsSchema = z.object({
  sandboxId: z.string().uuid().describe("The ID of the sandbox.")
});

const SecretRefSchema = z.object({
  projectId: z.string().trim().min(1).max(64),
  environment: z.string().trim().min(1).max(64),
  secretPath: z.string().trim().min(1).max(256),
  secretKey: z.string().trim().min(1).max(256)
});

const CredentialConfigSchema = z.object({
  role: z.nativeEnum(SandboxCredentialRole),
  headerName: z.string().trim().min(1).max(255).optional(),
  headerPrefix: z.string().trim().max(255).optional(),
  placeholderKey: z.string().trim().min(1).max(255).optional(),
  placeholderValue: z.string().trim().min(1).max(255).optional(),
  substitutionSurfaces: z.nativeEnum(SandboxSubstitutionSurface).array().max(4).optional()
});

const GrantsSchema = z.object({
  integrations: z
    .object({
      id: z.string().uuid(),
      type: z.nativeEnum(SandboxIntegrationType),
      hostnames: z.string().array(),
      secret: SecretRefSchema,
      credential: CredentialConfigSchema
    })
    .array()
    .default([]),
  pamAccountIds: z.string().uuid().array().max(25).default([])
});

const SandboxSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.nativeEnum(SandboxStatus),
  vcpu: z.number(),
  memoryMb: z.number(),
  grants: GrantsSchema,
  agentType: z.nativeEnum(SandboxAgentType).nullable(),
  agentModel: z.string().nullable(),
  hasAgentToken: z.boolean(),
  createdAt: z.string(),
  lastActivityAt: z.string().nullable(),
  commandsRun: z.number(),
  slackChannelId: z.string().nullable(),
  slackThreadTs: z.string().nullable()
});

const ExecResultSchema = z.object({
  command: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  durationMs: z.number(),
  cwd: z.string(),
  wasTruncated: z.boolean(),
  timedOut: z.boolean()
});

export const registerSandboxRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/project",
    config: { rateLimit: readLimit },
    schema: {
      // Internal: sandbox projects are never user-facing, so keep them out of the public docs.
      hide: true,
      operationId: "getSandboxProject",
      description: "Resolve the organization's Sandbox project, creating it on first access.",
      response: { 200: z.object({ projectId: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => ({
      projectId: await server.services.sandbox.resolveProjectId(req.permission)
    })
  });

  server.route({
    method: "GET",
    url: "/catalog",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getSandboxCatalog",
      description: "List the integrations and agents a sandbox can be configured with.",
      response: {
        200: z.object({
          integrations: z
            .object({
              type: z.nativeEnum(SandboxIntegrationType),
              name: z.string(),
              description: z.string(),
              hostnames: z.string().array(),
              envVarName: z.string(),
              role: z.nativeEnum(SandboxCredentialRole),
              headerName: z.string(),
              headerPrefix: z.string(),
              cli: z.object({ name: z.string(), binary: z.string() }).nullable()
            })
            .array(),
          agents: z
            .object({
              type: z.nativeEnum(SandboxAgentType),
              name: z.string(),
              tokenLabel: z.string(),
              isSupported: z.boolean()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async () => ({
      integrations: listSandboxIntegrations().map(
        ({ type, name, description, hostnames, envVarName, role, headerName, headerPrefix, cli }) => ({
          type,
          name,
          description,
          hostnames,
          envVarName,
          role,
          headerName,
          headerPrefix,
          cli
        })
      ),
      agents: SANDBOX_AGENTS
    })
  });

  server.route({
    method: "POST",
    url: "/:sandboxId/integrations",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "addSandboxIntegration",
      description: "Grant a sandbox brokered access to an integration.",
      params: SandboxIdParamsSchema,
      body: z.object({
        type: z.nativeEnum(SandboxIntegrationType),
        // Same pattern grammar the Agent Proxy uses: host[:port][/path] with `*.` wildcards.
        hostnames: hostPatternSchema.array().max(25).optional(),
        credential: CredentialConfigSchema.optional(),
        secret: SecretRefSchema
      }),
      response: { 200: z.object({ sandbox: SandboxSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandbox = await server.services.sandbox.addIntegration(
        { sandboxId: req.params.sandboxId, integration: req.body },
        req.permission
      );
      return { sandbox };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sandboxId/integrations/:integrationId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeSandboxIntegration",
      description: "Revoke a sandbox's access to an integration.",
      params: SandboxIdParamsSchema.extend({ integrationId: z.string().uuid() }),
      response: { 200: z.object({ sandbox: SandboxSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandbox = await server.services.sandbox.removeIntegration(
        { sandboxId: req.params.sandboxId, integrationId: req.params.integrationId },
        req.permission
      );
      return { sandbox };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listSandboxes",
      description: "List every sandbox in the organization.",
      response: { 200: z.object({ sandboxes: SandboxSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandboxes = await server.services.sandbox.listSandboxes(req.permission);
      return { sandboxes };
    }
  });

  server.route({
    method: "GET",
    url: "/:sandboxId/system-prompt",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getSandboxSystemPrompt",
      description: "The system prompt describing the tools and credentials available in this sandbox.",
      params: SandboxIdParamsSchema,
      response: {
        200: z.object({
          systemPrompt: z.string(),
          pamProxies: z
            .object({
              accountId: z.string(),
              accountName: z.string(),
              resourceName: z.string(),
              resourceType: z.string(),
              port: z.number()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => ({
      systemPrompt: await server.services.sandbox.getSystemPrompt({ sandboxId: req.params.sandboxId }, req.permission),
      pamProxies: await server.services.sandbox.listPamProxies({ sandboxId: req.params.sandboxId }, req.permission)
    })
  });

  server.route({
    method: "GET",
    url: "/:sandboxId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getSandboxById",
      description: "Get one sandbox, including its grants and runtime status.",
      params: SandboxIdParamsSchema,
      response: { 200: z.object({ sandbox: SandboxSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandbox = await server.services.sandbox.getSandboxById({ sandboxId: req.params.sandboxId }, req.permission);
      return { sandbox };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createSandbox",
      description: "Create a sandbox and the set of resources it is allowed to reach.",
      body: z.object({
        name: GenericResourceNameSchema,
        description: z.string().trim().max(500).optional(),
        vcpu: z.number().int().min(1).max(16).default(2),
        memoryMb: z.number().int().min(256).max(32768).default(2048)
      }),
      response: { 200: z.object({ sandbox: SandboxSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandbox = await server.services.sandbox.createSandbox(req.body, req.permission);
      return { sandbox };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:sandboxId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateSandbox",
      description: "Rename a sandbox, resize it, or change what it can reach.",
      params: SandboxIdParamsSchema,
      body: z.object({
        name: GenericResourceNameSchema.optional(),
        description: z.string().trim().max(500).optional(),
        vcpu: z.number().int().min(1).max(16).optional(),
        memoryMb: z.number().int().min(256).max(32768).optional(),
        pamAccountIds: z.string().uuid().array().max(25).optional(),
        agentType: z.nativeEnum(SandboxAgentType).optional(),
        agentModel: z.string().trim().min(1).max(128).optional(),
        agentToken: z.string().trim().min(1).max(500).optional()
      }),
      response: { 200: z.object({ sandbox: SandboxSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandbox = await server.services.sandbox.updateSandbox(
        { sandboxId: req.params.sandboxId, ...req.body },
        req.permission
      );
      return { sandbox };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sandboxId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteSandbox",
      description: "Stop and delete a sandbox.",
      params: SandboxIdParamsSchema,
      response: { 200: z.object({ sandbox: SandboxSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandbox = await server.services.sandbox.deleteSandbox({ sandboxId: req.params.sandboxId }, req.permission);
      return { sandbox };
    }
  });

  (
    [
      { path: "start", operationId: "startSandbox", method: "startSandbox" as const },
      { path: "stop", operationId: "stopSandbox", method: "stopSandbox" as const }
    ] as const
  ).forEach(({ path, operationId, method }) => {
    server.route({
      method: "POST",
      url: `/:sandboxId/${path}`,
      config: { rateLimit: writeLimit },
      schema: {
        operationId,
        params: SandboxIdParamsSchema,
        response: { 200: z.object({ sandbox: SandboxSchema }) }
      },
      onRequest: verifyAuth([AuthMode.JWT]),
      handler: async (req) => {
        const sandbox = await server.services.sandbox[method]({ sandboxId: req.params.sandboxId }, req.permission);
        return { sandbox };
      }
    });
  });

  server.route({
    method: "POST",
    url: "/:sandboxId/start/stream",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "startSandboxWithProgress",
      description: "Start a sandbox, streaming boot progress as each stage completes.",
      params: SandboxIdParamsSchema,
      produces: ["text/event-stream"]
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      // Fastify replies are thenable, so the hijack call reads as a floating promise without this.
      void reply.hijack();
      reply.raw.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

      try {
        await server.services.sandbox.startSandbox(
          { sandboxId: req.params.sandboxId, onProgress: send },
          req.permission
        );
        send({ type: "ready" });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "The sandbox failed to start." });
      } finally {
        reply.raw.end();
      }
    }
  });

  server.route({
    method: "POST",
    url: "/:sandboxId/chat/stream",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "streamSandboxAgentChat",
      description: "Run one agent turn, streaming text and tool calls as they happen.",
      params: SandboxIdParamsSchema,
      body: z.object({
        messages: z
          .object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(10_000) })
          .array()
          .min(1)
          .max(50)
      }),
      produces: ["text/event-stream"]
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      // Fastify replies are thenable, so the hijack call reads as a floating promise without this.
      void reply.hijack();
      reply.raw.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

      try {
        await server.services.sandbox.chatWithAgent(
          { sandboxId: req.params.sandboxId, messages: req.body.messages, onEvent: send },
          req.permission
        );
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "The agent failed." });
      } finally {
        reply.raw.end();
      }
    }
  });

  server.route({
    method: "POST",
    url: "/:sandboxId/chat",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "chatWithSandboxAgent",
      description: "Send a message to the sandbox's agent and run one turn, tools included.",
      params: SandboxIdParamsSchema,
      body: z.object({
        messages: z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(10_000)
          })
          .array()
          .min(1)
          .max(50)
      }),
      response: {
        200: z.object({
          reply: z.string(),
          toolCalls: z
            .object({
              command: z.string(),
              exitCode: z.number().nullable(),
              output: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.sandbox.chatWithAgent(
        { sandboxId: req.params.sandboxId, messages: req.body.messages },
        req.permission
      )
  });

  server.route({
    method: "POST",
    url: "/:sandboxId/exec",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "execInSandbox",
      description: "Run a shell command inside a running sandbox and return its output.",
      params: SandboxIdParamsSchema,
      body: z.object({
        command: z.string().trim().min(1).max(4000).describe("The shell command to run.")
      }),
      response: { 200: z.object({ result: ExecResultSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.sandbox.execCommand(
        { sandboxId: req.params.sandboxId, command: req.body.command },
        req.permission
      );
      return { result };
    }
  });

  server.route({
    method: "POST",
    url: "/:sandboxId/slack-link",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "linkSandboxSlackConversation",
      description:
        "Point a Slack channel or thread at this sandbox. Messages there are relayed to the agent. Pass a null channel to unlink.",
      params: SandboxIdParamsSchema,
      body: z.object({
        channelId: z
          .string()
          .trim()
          .max(64)
          .nullable()
          .describe("Slack channel ID, e.g. C0123456789. Null unlinks the sandbox."),
        threadTs: z
          .string()
          .trim()
          .max(64)
          .nullable()
          .default(null)
          .describe("Optional thread timestamp, to scope the link to one thread in that channel.")
      }),
      response: { 200: z.object({ sandbox: SandboxSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sandbox = await server.services.sandbox.linkSlackConversation(
        {
          sandboxId: req.params.sandboxId,
          channelId: req.body.channelId,
          threadTs: req.body.threadTs
        },
        req.permission
      );
      return { sandbox };
    }
  });

  server.route({
    method: "POST",
    url: "/slack/events",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      body: z.unknown(),
      response: { 200: z.union([z.string(), z.object({ ok: z.literal(true) })]) }
    },
    handler: async (req, res) => {
      const challenge = await server.services.sandbox.handleSlackEvent({
        rawBody: req.rawJsonBody ?? "",
        timestamp: String(req.headers["x-slack-request-timestamp"] ?? ""),
        signature: String(req.headers["x-slack-signature"] ?? "")
      });

      // Slack's endpoint registration expects the challenge echoed back as plain text.
      if (challenge) return res.type("text/plain").send(challenge);
      return { ok: true as const };
    }
  });

  server.route({
    method: "GET",
    url: "/:sandboxId/commands/stream",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "streamSandboxCommands",
      description: "Every command the sandbox runs, backlog first then live.",
      params: SandboxIdParamsSchema,
      produces: ["text/event-stream"]
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      // Fastify replies are thenable, so the hijack call reads as a floating promise without this.
      void reply.hijack();
      reply.raw.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = await server.services.sandbox.streamCommandLog(
          { sandboxId: req.params.sandboxId, onEntry: send },
          req.permission
        );
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Could not open the command log." });
        reply.raw.end();
        return;
      }

      // A sandbox can sit idle far longer than an idle proxy will hold a connection open.
      const heartbeat = setInterval(() => reply.raw.write(": keep-alive\n\n"), 25_000);

      req.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe?.();
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:sandboxId/files",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listSandboxFiles",
      description: "List a directory inside the sandbox.",
      params: SandboxIdParamsSchema,
      querystring: z.object({
        path: z.string().trim().max(1024).default("").describe("Absolute path, defaults to the sandbox home.")
      }),
      response: {
        200: z.object({
          path: z.string(),
          entries: z
            .object({
              name: z.string(),
              path: z.string(),
              isDirectory: z.boolean(),
              size: z.number().nullable()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.sandbox.listFiles(
        { sandboxId: req.params.sandboxId, path: req.query.path },
        req.permission
      )
  });

  server.route({
    method: "GET",
    url: "/:sandboxId/files/content",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "readSandboxFile",
      description: "Read one file inside the sandbox, capped for preview.",
      params: SandboxIdParamsSchema,
      querystring: z.object({ path: z.string().trim().min(1).max(1024) }),
      response: {
        200: z.object({ path: z.string(), content: z.string(), wasTruncated: z.boolean() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.sandbox.readFile(
        { sandboxId: req.params.sandboxId, path: req.query.path },
        req.permission
      )
  });

  server.route({
    method: "GET",
    url: "/:sandboxId/processes",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listSandboxProcesses",
      description: "What is running inside the sandbox, with its container's resource use.",
      params: SandboxIdParamsSchema,
      response: {
        200: z.object({
          processes: z
            .object({ pid: z.number(), command: z.string(), memoryKb: z.number() })
            .array(),
          stats: z
            .object({
              cpuPercent: z.number(),
              memoryUsedMb: z.number(),
              memoryLimitMb: z.number(),
              memoryPercent: z.number(),
              networkIn: z.string(),
              networkOut: z.string(),
              processCount: z.number()
            })
            .nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.sandbox.listProcesses({ sandboxId: req.params.sandboxId }, req.permission)
  });

  server.route({
    method: "POST",
    url: "/:sandboxId/processes/:pid/terminate",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "terminateSandboxProcess",
      description: "Kill one process inside the sandbox.",
      params: SandboxIdParamsSchema.extend({ pid: z.coerce.number().int().min(1) }),
      response: { 200: z.object({ pid: z.number() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.sandbox.killProcess(
        { sandboxId: req.params.sandboxId, pid: req.params.pid },
        req.permission
      );
      return { pid: req.params.pid };
    }
  });
};
