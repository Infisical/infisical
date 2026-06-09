import z from "zod";

import { PamResourceRole } from "@app/ee/services/pam/pam-enums";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const DEFAULT_RESOURCE_ROLES = [
  {
    slug: PamResourceRole.Admin,
    name: "Admin",
    isDefault: true,
    description: "Full control of accounts, folders, sessions, and grants"
  },
  {
    slug: PamResourceRole.Requester,
    name: "Requester",
    isDefault: true,
    description: "Submit access requests; cannot view credentials directly"
  },
  {
    slug: PamResourceRole.Auditor,
    name: "Auditor",
    isDefault: true,
    description: "View audit logs and session recordings; no access changes"
  }
];

const ResourceRoleSchema = z.object({
  slug: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  description: z.string()
});

export const registerPamResourceRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listPamResourceRoles",
      response: { 200: z.array(ResourceRoleSchema) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async () => {
      return DEFAULT_RESOURCE_ROLES;
    }
  });
};
