import { z } from "zod";

import { GitAppOrgSchema } from "@app/db/schemas/git-app-org";
import { SecretScanningGitRisksSchema } from "@app/db/schemas/secret-scanning-git-risks";
import { canUseSecretScanning } from "@app/ee/services/secret-scanning/secret-scanning-fns";
import {
  SecretScanningResolvedStatus,
  SecretScanningRiskStatus
} from "@app/ee/services/secret-scanning/secret-scanning-types";
import { BadRequestError } from "@app/lib/errors";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretScanningRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/create-installation-session/organization",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({
          sessionId: z.string(),
          gitAppSlug: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (!canUseSecretScanning(req.auth.orgId)) {
        throw new BadRequestError({
          message: "Secret scanning is temporarily unavailable."
        });
      }

      const session = await server.services.secretScanning.createInstallationSession({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.body.organizationId
      });

      return session;
    }
  });

  server.route({
    method: "POST",
    url: "/link-installation",
    config: {
      rateLimit: writeLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return installatedApp;
    }
  });

  server.route({
    method: "GET",
    url: "/installation-status/organization/:organizationId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({ appInstallationCompleted: z.boolean() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const appInstallationCompleted = await server.services.secretScanning.getOrgInstallationStatus({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId
      });
      return { appInstallationCompleted };
    }
  });

  server.route({
    url: "/organization/:organizationId/risks/export",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      querystring: z.object({
        repositoryNames: z
          .string()
          .optional()
          .nullable()
          .transform((val) => (val ? val.split(",") : undefined)),
        resolvedStatus: z.nativeEnum(SecretScanningResolvedStatus).optional()
      }),
      response: {
        200: z.object({
          risks: SecretScanningGitRisksSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const risks = await server.services.secretScanning.getAllRisksByOrg({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        filter: {
          repositoryNames: req.query.repositoryNames,
          resolvedStatus: req.query.resolvedStatus
        }
      });
      return { risks };
    }
  });

  server.route({
    url: "/organization/:organizationId/risks",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),

      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(20000).default(100),
        orderBy: z.enum(["createdAt", "name"]).default("createdAt"),
        orderDirection: z.nativeEnum(OrderByDirection).default(OrderByDirection.DESC),
        repositoryNames: z
          .string()
          .optional()
          .nullable()
          .transform((val) => (val ? val.split(",") : undefined)),
        resolvedStatus: z.nativeEnum(SecretScanningResolvedStatus).optional()
      }),

      response: {
        200: z.object({
          risks: SecretScanningGitRisksSchema.array(),
          totalCount: z.number(),
          repos: z.array(z.string())
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { risks, totalCount, repos } = await server.services.secretScanning.getRisksByOrg({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        filter: {
          limit: req.query.limit,
          offset: req.query.offset,
          orderBy: req.query.orderBy,
          orderDirection: req.query.orderDirection,
          repositoryNames: req.query.repositoryNames,
          resolvedStatus: req.query.resolvedStatus
        }
      });
      return { risks, totalCount, repos };
    }
  });

  server.route({
    method: "POST",
    url: "/organization/:organizationId/risks/:riskId/status",
    config: {
      rateLimit: writeLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        riskId: req.params.riskId,
        ...req.body
      });
      return risk;
    }
  });
};
