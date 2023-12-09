import { z } from "zod";

import {
  OrganizationsSchema,
  OrgMembershipsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:organizationId/memberships",
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          users: OrgMembershipsSchema.merge(
            z.object({
              user: UsersSchema.pick({
                email: true,
                firstName: true,
                lastName: true,
                id: true
              }).merge(UserEncryptionKeysSchema.pick({ publicKey: true }))
            })
          )
            .omit({ createdAt: true, updatedAt: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const users = await server.services.org.findAllOrgMembers(
        req.auth.userId,
        req.params.organizationId
      );
      return { users };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId/memberships/:membershipId",
    schema: {
      params: z.object({ organizationId: z.string().trim(), membershipId: z.string().trim() }),
      body: z.object({
        role: z.string().trim()
      }),
      response: {
        200: z.object({
          membership: OrgMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const membership = await server.services.org.updateOrgMembership({
        userId: req.auth.userId,
        role: req.body.role,
        orgId: req.params.organizationId,
        membershipId: req.params.membershipId
      });
      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/memberships/:membershipId",
    schema: {
      params: z.object({ organizationId: z.string().trim(), membershipId: z.string().trim() }),
      response: {
        200: z.object({
          membership: OrgMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const membership = await server.services.org.deleteOrgMembership({
        userId: req.auth.userId,
        orgId: req.params.organizationId,
        membershipId: req.params.membershipId
      });
      return { membership };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    schema: {
      body: z.object({
        name: z.string().trim()
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const organization = await server.services.org.createOrganization(
        req.auth.userId,
        req.body.name
      );
      return { organization };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId",
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const organization = await server.services.org.deleteOrganizationById(
        req.auth.userId,
        req.params.organizationId
      );
      return { organization };
    }
  });
};
