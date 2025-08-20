import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ApiShieldRules } from "@app/services/api-shield/api-shield-types";
import { AuthMode } from "@app/services/auth/auth-type";

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

      const perm = await server.services.permission.getProjectPermission({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        actionProjectType: ActionProjectType.ApiShield
      });

      const roles = perm.membership.roles.map((v) => v.role);

      const params = new URLSearchParams(targetUrlObj.search);
      const queryString: string[] = [];
      for (const [key, value] of params.entries()) {
        queryString.push(`${key}=${value}`);
      }

      // checkRequestPassesRules is synchronous, so no await is needed.
      const passed = server.services.apiShield.checkRequestPassesRules({
        rules: bridge.ruleSet as ApiShieldRules,
        ip: req.ip,
        requestMethod: req.method,
        uriPath: targetUrlObj.pathname,
        queryString,
        userAgent: req.headers["user-agent"] || "",
        roles
      });

      let suspicious = false;
      if (bridge.shadowRuleSet) {
        const passedShadowRules = server.services.apiShield.checkRequestPassesRules({
          rules: bridge.shadowRuleSet as ApiShieldRules,
          ip: req.ip,
          requestMethod: req.method,
          uriPath: targetUrlObj.pathname,
          queryString,
          userAgent: req.headers["user-agent"] || "",
          roles
        });
        suspicious = !passedShadowRules;
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: bridge.projectId,
        event: {
          type: EventType.API_SHIELD_REQUEST,
          metadata: {
            result: passed ? "PASSED" : "BLOCKED",
            suspicious,
            ip: req.ip,
            requestMethod: req.method,
            uriPath: targetUrlObj.pathname,
            queryString: queryString.length > 0 ? queryString : undefined,
            userAgent: req.headers["user-agent"] || "",
            bridgeId: bridge.id,
            headers: Object.fromEntries(
              Object.entries(req.headers)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => {
                  let stringValue: string;
                  if (Array.isArray(value)) {
                    stringValue = value.join(", ");
                  } else {
                    stringValue = value as string;
                  }

                  if (key.toLowerCase() === "authorization") {
                    return [key, "[redacted]"];
                  }
                  return [key, stringValue];
                })
            ),
            body: req.body
          }
        }
      });

      if (!passed) {
        throw new UnauthorizedError({
          message: "You request has been blocked by API Shield"
        });
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
