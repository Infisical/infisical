import { z } from "zod";

import { SandboxStatus } from "@app/ee/services/sandbox/sandbox-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SandboxIdParamsSchema = z.object({
  sandboxId: z.string().uuid().describe("The ID of the sandbox.")
});

const GrantsSchema = z.object({
  pamAccountIds: z.string().uuid().array().max(25).default([]),
  proxiedServiceIds: z.string().uuid().array().max(25).default([]),
  clis: z.string().trim().min(1).max(64).array().max(25).default([])
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
  createdAt: z.string(),
  lastActivityAt: z.string().nullable(),
  commandsRun: z.number()
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
        memoryMb: z.number().int().min(256).max(32768).default(2048),
        grants: GrantsSchema.partial().optional()
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
        grants: GrantsSchema.partial().optional()
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
};
