import type WebSocket from "ws";
import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { InfraRunStatus } from "@app/services/infra/infra-types";

export const registerInfraRouter = async (server: FastifyZodProvider) => {
  // POST /api/v1/infra/run — run plan or apply (non-streaming fallback)
  server.route({
    method: "POST",
    url: "/run",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.object({
        hcl: z.string().min(1, "HCL content is required"),
        mode: z.enum(["plan", "apply"]).default("plan")
      }),
      response: {
        200: z.object({
          output: z.string(),
          status: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      let output = "";
      let status: InfraRunStatus = InfraRunStatus.Running;

      await new Promise<void>((resolve) => {
        server.services.infra.run(
          { hcl: req.body.hcl, mode: req.body.mode },
          (chunk: string) => {
            output += chunk;
          },
          (finalStatus: InfraRunStatus) => {
            status = finalStatus;
            resolve();
          }
        );
      });

      return { output, status };
    }
  });

  // WebSocket /api/v1/infra/run/stream — streaming plan/apply output
  server.route({
    method: "GET",
    url: "/run/stream",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        hcl: z.string().min(1),
        mode: z.enum(["plan", "apply"]).default("plan")
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    wsHandler: async (connection: WebSocket, req: { query: { hcl: string; mode: "plan" | "apply" } }) => {
      try {
        server.services.infra.run(
          { hcl: req.query.hcl, mode: req.query.mode },
          (chunk: string) => {
            if (connection.readyState === 1) {
              connection.send(JSON.stringify({ type: "output", data: chunk }));
            }
          },
          (status: InfraRunStatus) => {
            if (connection.readyState === 1) {
              connection.send(JSON.stringify({ type: "complete", status }));
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
};
