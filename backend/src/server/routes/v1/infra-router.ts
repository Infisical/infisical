import type WebSocket from "ws";
import { z } from "zod";

import { InfraFilesSchema } from "@app/db/schemas/infra-files";
import { InfraRunsSchema } from "@app/db/schemas/infra-runs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerInfraRouter = async (server: FastifyZodProvider) => {
  // ── File Endpoints ──

  server.route({
    method: "GET",
    url: "/:projectId/files",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      response: { 200: z.object({ files: InfraFilesSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const files = await server.services.infra.listFiles(req.params.projectId);
      return { files };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/files",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      body: z.object({ name: z.string().min(1), content: z.string() }),
      response: { 200: z.object({ file: InfraFilesSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const file = await server.services.infra.upsertFile({
        projectId: req.params.projectId,
        name: req.body.name,
        content: req.body.content
      });
      return { file };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/files/:name",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string(), name: z.string() }),
      response: { 200: z.object({ success: z.boolean() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.infra.deleteFile({
        projectId: req.params.projectId,
        name: req.params.name
      });
      return { success: true };
    }
  });

  // GET checksums for sync detection (CLI uses this)
  server.route({
    method: "GET",
    url: "/:projectId/files/checksums",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      response: { 200: z.object({ checksums: z.record(z.string()) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const checksums = await server.services.infra.getFileChecksums(req.params.projectId);
      return { checksums };
    }
  });

  // Pull all files (CLI download)
  server.route({
    method: "POST",
    url: "/:projectId/files/pull",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      response: { 200: z.object({ files: z.array(z.object({ name: z.string(), content: z.string() })) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const files = await server.services.infra.listFiles(req.params.projectId);
      return { files: files.map((f) => ({ name: f.name, content: f.content })) };
    }
  });

  // ── Resource Endpoints ──

  server.route({
    method: "GET",
    url: "/:projectId/resources",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      response: {
        200: z.object({
          resources: z.array(
            z.object({
              type: z.string(),
              name: z.string(),
              provider: z.string(),
              address: z.string(),
              attributes: z.record(z.unknown())
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resources = await server.services.infra.getResources(req.params.projectId);
      return { resources };
    }
  });

  // ── Graph Endpoint ──

  server.route({
    method: "GET",
    url: "/:projectId/graph",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      response: {
        200: z.object({
          nodes: z.array(
            z.object({
              id: z.string(),
              type: z.string(),
              name: z.string(),
              provider: z.string()
            })
          ),
          edges: z.array(
            z.object({
              source: z.string(),
              target: z.string()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.infra.getGraph(req.params.projectId);
    }
  });

  // ── Run Endpoints ──

  server.route({
    method: "GET",
    url: "/:projectId/runs",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      querystring: z.object({
        limit: z.coerce.number().optional().default(50),
        offset: z.coerce.number().optional().default(0)
      }),
      response: { 200: z.object({ runs: InfraRunsSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const runs = await server.services.infra.listRuns({
        projectId: req.params.projectId,
        limit: req.query.limit,
        offset: req.query.offset
      });
      return { runs };
    }
  });

  // Get single run detail
  server.route({
    method: "GET",
    url: "/:projectId/runs/:runId",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string(), runId: z.string() }),
      response: {
        200: z.object({
          run: InfraRunsSchema,
          previousFileSnapshot: z.record(z.string()).nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { previousFileSnapshot, ...run } = await server.services.infra.getRun(req.params.runId);
      return { run, previousFileSnapshot };
    }
  });

  // Approve a run that is awaiting_approval
  server.route({
    method: "POST",
    url: "/:projectId/runs/:runId/approve",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string(), runId: z.string() }),
      response: { 200: z.object({ run: InfraRunsSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const run = await server.services.infra.approveRun(req.params.runId);
      return { run };
    }
  });

  // Deny a run that is awaiting_approval
  server.route({
    method: "POST",
    url: "/:projectId/runs/:runId/deny",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string(), runId: z.string() }),
      response: { 200: z.object({ run: InfraRunsSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const run = await server.services.infra.denyRun(req.params.runId);
      return { run };
    }
  });

  // Trigger plan or apply (synchronous)
  server.route({
    method: "POST",
    url: "/:projectId/run",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      body: z.object({ mode: z.enum(["plan", "apply", "destroy"]).default("plan"), approved: z.boolean().optional() }),
      response: {
        200: z.object({
          output: z.string(),
          status: z.string(),
          runId: z.string(),
          planJson: z.unknown().nullable().optional(),
          aiSummary: z.string().nullable().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      let output = "";
      const result = await new Promise<{
        id: string;
        status: string;
        planJson?: unknown;
        aiSummary?: string | null;
      }>((resolve) => {
        server.services.infra.triggerRun(
          {
            projectId: req.params.projectId,
            mode: req.body.mode,
            userId: req.permission.id,
            approved: req.body.approved
          },
          (chunk: string) => {
            output += chunk;
          },
          (run) => resolve(run)
        );
      });

      return {
        output,
        status: result.status,
        runId: result.id,
        planJson: result.planJson ?? null,
        aiSummary: result.aiSummary ?? null
      };
    }
  });

  // WebSocket streaming
  server.route({
    method: "GET",
    url: "/:projectId/run/stream",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      querystring: z.object({ mode: z.enum(["plan", "apply", "destroy"]).default("plan") }),
      response: { 200: z.object({ message: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    wsHandler: async (
      connection: WebSocket,
      req: { params: { projectId: string }; query: { mode: "plan" | "apply" | "destroy" }; permission: { id: string } }
    ) => {
      try {
        server.services.infra.triggerRun(
          {
            projectId: req.params.projectId,
            mode: req.query.mode,
            userId: req.permission.id
          },
          (chunk: string) => {
            if (connection.readyState === 1) {
              connection.send(JSON.stringify({ type: "output", data: chunk }));
            }
          },
          (run: { id: string; status: string; planJson?: unknown; aiSummary?: string | null }) => {
            if (connection.readyState === 1) {
              connection.send(JSON.stringify({ type: "complete", ...run }));
              connection.close();
            }
          }
        );
      } catch (err) {
        connection.send(JSON.stringify({ type: "error", data: String(err) }));
        connection.close();
      }
    },
    handler: () => ({ message: "WebSocket upgrade required" })
  });

  // ── State Backend (for OpenTofu HTTP backend — no auth, called by tofu child process) ──

  server.route({
    method: "GET",
    url: "/:projectId/state",
    config: { rateLimit: readLimit },
    schema: { params: z.object({ projectId: z.string() }) },
    handler: async (req, reply) => {
      const state = await server.services.infra.getState(req.params.projectId);
      if (!state) {
        return reply.status(404).send({ error: "No state found" });
      }
      // Tofu HTTP backend expects raw JSON state with application/json content type
      return reply.header("Content-Type", "application/json").send(
        typeof state.content === "string" ? state.content : JSON.stringify(state.content)
      );
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/state",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string() }),
      body: z.unknown()
    },
    handler: async (req, reply) => {
      await server.services.infra.upsertState(req.params.projectId, req.body);
      return reply.send({ success: true });
    }
  });
};
