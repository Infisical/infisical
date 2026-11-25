import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateLdapConnectionSchema,
  DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT,
  DIRECTORY_MACHINE_LIST_MAX_LIMIT,
  SanitizedLdapConnectionSchema,
  UpdateLdapConnectionSchema
} from "@app/services/app-connection/ldap";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerLdapConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.LDAP,
    server,
    sanitizedResponseSchema: SanitizedLdapConnectionSchema,
    createSchema: CreateLdapConnectionSchema,
    updateSchema: UpdateLdapConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/machines`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listLdapDirectoryMachines",
      params: z.object({
        connectionId: z.string().uuid().describe("The ID of the LDAP Connection to list machines from.")
      }),
      querystring: z.object({
        search: z
          .string()
          .trim()
          .max(255)
          .optional()
          .describe("Filter machines whose name or DNS host name begins with this value."),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(DIRECTORY_MACHINE_LIST_MAX_LIMIT)
          .default(DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT)
          .describe("The maximum number of machines to return.")
      }),
      response: {
        200: z.object({
          machines: z
            .object({
              hostname: z.string().describe("The machine's DNS host name, or its common name if it has none.")
            })
            .array()
            .describe("Machines read from the directory, offered as suggestions for a sync's target host.")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { search, limit } = req.query;
      const machines = await server.services.appConnection.ldap.listMachines(
        connectionId,
        { search, limit },
        req.permission
      );
      return { machines };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/groups`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listLdapDirectoryGroups",
      tags: [ApiDocsTags.AppConnections],
      description:
        "Search the Active Directory security groups an LDAP connection can read, for example to find the SIDs that a Microsoft Autoenrollment profile's allowedGroupSids takes. Requires permission to connect the LDAP connection.",
      params: z.object({
        connectionId: z.string().uuid().describe("The ID of the LDAP Connection to search groups in.")
      }),
      querystring: z.object({
        search: z
          .string()
          .trim()
          .max(64)
          .optional()
          .describe("Text the group name contains. Up to 50 groups are returned.")
      }),
      response: {
        200: z.object({
          groups: z
            .object({ sid: z.string(), name: z.string() })
            .array()
            .describe("Active Directory security groups, with their security identifier (SID) and name."),
          isTruncated: z.boolean().describe("Whether more groups match than were returned.")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.appConnection.ldap.listGroups(
        req.params.connectionId,
        { search: req.query.search },
        req.permission
      )
  });
};
