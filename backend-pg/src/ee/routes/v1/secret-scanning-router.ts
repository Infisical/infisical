import { z } from "zod";

import { GitAppOrgSchema, SecretScanningGitRisksSchema } from "@app/db/schemas";
import { SecretScanningRiskStatus } from "@app/ee/services/secret-scanning/secret-scanning-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretScanningRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/create-installation-session/organization",
    method: "POST",
    schema: {
      body: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({
          sessionId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const session = await server.services.secretScanning.createInstallationSession({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.body.organizationId
      });
      return session;
    }
  });

  server.route({
    url: "/link-installation",
    method: "POST",
    schema: {
      body: z.object({
        installationId: z.string(),
        sessionId: z.string().trim()
      }),
      response: {
        200: GitAppOrgSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { installatedApp } = await server.services.secretScanning.linkInstallationToOrg({
        actor: req.permission.type,
        actorId: req.permission.id,
        ...req.body
      });
      return installatedApp;
    }
  });

  server.route({
    url: "/installation-status/organization/:organizationId",
    method: "GET",
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({ appInstallationCompleted: z.boolean() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const appInstallationCompleted =
        await server.services.secretScanning.getOrgInstallationStatus({
          actor: req.permission.type,
          actorId: req.permission.id,
          orgId: req.params.organizationId
        });
      return { appInstallationCompleted };
    }
  });

  server.route({
    url: "/organization/:organizationId/risks",
    method: "GET",
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({ risks: SecretScanningGitRisksSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { risks } = await server.services.secretScanning.getRisksByOrg({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.params.organizationId
      });
      return { risks };
    }
  });

  server.route({
    url: "/organization/:organizationId/risks/:riskId/status",
    method: "POST",
    schema: {
      params: z.object({ organizationId: z.string().trim(), riskId: z.string().trim() }),
      body: z.object({ status: z.nativeEnum(SecretScanningRiskStatus) }),
      response: {
        200: SecretScanningGitRisksSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { risk } = await server.services.secretScanning.updateRiskStatus({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.params.organizationId,
        riskId: req.params.riskId,
        ...req.body
      });
      return risk;
    }
  });
};
