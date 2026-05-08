import { z } from "zod";

import { AccessScope, ProjectMembershipRole, ProjectRolesSchema } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { SanitizedRoleSchema } from "../../sanitizedSchemas";

const CERT_MANAGER_ROLE_SLUGS = new Set([ProjectMembershipRole.Admin, ProjectMembershipRole.Member]);
const CERT_MANAGER_CUSTOM_ROLE_ERROR =
  "Certificate Manager does not support custom roles. Use the built-in Admin or Member role.";

export const registerCertManagerAccessRolesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/roles",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "listCertManagerRoles",
      response: {
        200: z.object({
          roles: ProjectRolesSchema.omit({ permissions: true, version: true, projectId: true }).array()
        })
      }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { roles } = await server.services.role.listRoles({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {}
      });
      return {
        roles: roles.filter((el) => CERT_MANAGER_ROLE_SLUGS.has(el.slug as ProjectMembershipRole))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/roles/slug/:roleSlug",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getCertManagerRoleBySlug",
      params: z.object({ roleSlug: z.string().trim().min(1) }),
      response: { 200: z.object({ role: SanitizedRoleSchema.omit({ projectId: true }) }) }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const role = await server.services.role.getRoleBySlug({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { slug: req.params.roleSlug }
      });
      return { role };
    }
  });

  server.route({
    method: "POST",
    url: "/roles",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: { operationId: "createCertManagerRole" },
    handler: async () => {
      throw new BadRequestError({ message: CERT_MANAGER_CUSTOM_ROLE_ERROR });
    }
  });

  server.route({
    method: "PATCH",
    url: "/roles/:roleId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateCertManagerRole",
      params: z.object({ roleId: z.string().trim().min(1) })
    },
    handler: async () => {
      throw new BadRequestError({ message: CERT_MANAGER_CUSTOM_ROLE_ERROR });
    }
  });

  server.route({
    method: "DELETE",
    url: "/roles/:roleId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "deleteCertManagerRole",
      params: z.object({ roleId: z.string().trim().min(1) })
    },
    handler: async () => {
      throw new BadRequestError({ message: CERT_MANAGER_CUSTOM_ROLE_ERROR });
    }
  });
};
