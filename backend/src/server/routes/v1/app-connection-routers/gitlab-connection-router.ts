import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGitLabConnectionSchema,
  SanitizedGitLabConnectionSchema,
  UpdateGitLabConnectionSchema
} from "@app/services/app-connection/gitlab";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGitLabConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.GitLab,
    server,
    sanitizedResponseSchema: SanitizedGitLabConnectionSchema,
    createSchema: CreateGitLabConnectionSchema,
    updateSchema: UpdateGitLabConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  // server.route({
  //   method: "GET",
  //   url: `/:connectionId/workspaces`,
  //   config: {
  //     rateLimit: readLimit
  //   },
  //   schema: {
  //     params: z.object({
  //       connectionId: z.string().uuid()
  //     }),
  //     response: {
  //       200: z
  //         .object({
  //           id: z.string(),
  //           name: z.string()
  //         })
  //         .array()
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT]),
  //   handler: async (req) => {
  //     const { connectionId } = req.params;
  //
  //     const workspaces = await server.services.appConnection.windmill.listWorkspaces(connectionId, req.permission);
  //
  //     return workspaces;
  //   }
  // });
};
