import { z } from "zod";

import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ApiShieldRulesSchema } from "@app/services/api-shield/api-shield-schemas";
import { ApiShieldRules } from "@app/services/api-shield/api-shield-types";
import { AuthMode } from "@app/services/auth/auth-type";
import { ActionProjectType } from "@app/db/schemas";

const allowedRequestMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;
type TAllowedRequestMethods = (typeof allowedRequestMethods)[number];

export const registerApiShieldRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: [...allowedRequestMethods],
    url: "/request/:projectId/:slug",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string(),
        slug: z.string()
      }),
      querystring: z.object({
        uri: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      const { uri } = req.query;
      const { slug, projectId } = req.params;

      // TODO(andrey): Verify user is in project (and possibly add perm checks)

      const bridge = await server.services.bridge.getBySlug({
        projectId,
        slug
      });

      let targetUrlObj: URL;
      try {
        const decodedTargetUri = decodeURIComponent(uri);
        targetUrlObj = new URL(decodedTargetUri, bridge.baseUrl);
      } catch (e) {
        throw new Error(`Invalid bridge ID provided: ${uri}. Error: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (!bridge.ruleSet) {
        throw new UnauthorizedError();
      }

      const currentRules = bridge.ruleSet as ApiShieldRules;

      const perm = await server.services.permission.getProjectPermission({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        actionProjectType: ActionProjectType.ApiShield
      });

      perm.

      // checkRequestPassesRules is synchronous, so no await is needed.
      const passed = server.services.apiShield.checkRequestPassesRules({
        rules: currentRules,
        ip: req.ip,
        requestMethod: req.method,
        // TODO(andrey): Also support query params
        uriPath: targetUrlObj.pathname,
        userAgent: req.headers["user-agent"] || "",
        roles: perm.membership.roles.map((v) => v.role)
      });

      if (!passed) {
        throw new UnauthorizedError();
      }

      // If the request passes, call the correct endpoint using request
      const headersToSend: Record<string, string | string[]> = {};

      for (const key in req.headers) {
        if (key && req.headers[key] !== undefined) {
          // Filter out hop-by-hop headers and others managed by axios/Node.js core
          if (
            !["host", "connection", "content-length", "transfer-encoding", "expect", "authorization"].includes(
              key.toLowerCase()
            )
          ) {
            const value = req.headers[key];
            if (typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"))) {
              headersToSend[key] = value;
            }
          }
        }
      }

      for (const header of bridge.headers) {
        headersToSend[header.key] = header.value;
      }

      const requestOptions: {
        method: TAllowedRequestMethods;
        url: string;
        headers: Record<string, string | string[]>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any;
        validateStatus?: (status: number) => boolean; // To prevent throwing on non-2xx responses
      } = {
        method: req.method as TAllowedRequestMethods,
        url: targetUrlObj.toString(),
        headers: headersToSend,
        validateStatus: () => true
      };

      // Handle request body for methods that typically have one
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (req.body !== undefined && req.body !== null) {
          requestOptions.data = req.body;
        }
      }

      let axiosResponse;
      try {
        axiosResponse = await request(requestOptions);
      } catch (error) {
        logger.error(error, "Failed to make external request");
        throw new Error(`Failed to make external request: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Set the response status code and headers from the external response
      void reply.code(axiosResponse.status);

      if (axiosResponse.headers) {
        for (const [key, value] of Object.entries(axiosResponse.headers)) {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey !== "connection" &&
            lowerKey !== "transfer-encoding" &&
            lowerKey !== "content-length" &&
            value !== undefined
          ) {
            void reply.header(key, value);
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return axiosResponse.data;
    }
  });
};
