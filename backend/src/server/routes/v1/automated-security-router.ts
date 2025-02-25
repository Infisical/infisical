import z from "zod";

import { AutomatedSecurityReportsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAutomatedSecurityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/trigger",
    handler: async () => {
      return server.services.automatedSecurity.processSecurityJob();
    }
  });

  server.route({
    method: "GET",
    url: "/reports",
    schema: {
      response: {
        200: AutomatedSecurityReportsSchema.extend({
          userId: z.string().nullish(),
          name: z.string().nullish()
        }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.automatedSecurity.getReports(req.permission.orgId);
    }
  });

  server.route({
    method: "PATCH",
    url: "/reports/:id/status",
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: AutomatedSecurityReportsSchema.extend({
          userId: z.string().nullish(),
          name: z.string().nullish()
        }).array()
      },
      body: z.object({
        status: z.enum(["ignored", "resolved"])
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.automatedSecurity.patchSecurityReportStatus(req.params.id, req.body.status);
    }
  });

  server.route({
    method: "POST",
    url: "/project-permission/analyze",
    schema: {
      body: z.object({
        projectId: z.string(),
        userId: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      return server.services.automatedSecurity.analyzeIdentityProjectPermission(req.body.userId, req.body.projectId);
    }
  });
};
