import z from "zod";

import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerGatewayV2Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      body: z.object({
        proxyName: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      const gateway = await server.services.gatewayV2.registerGateway({
        orgId: req.permission.orgId,
        proxyName: req.body.proxyName,
        actorId: req.permission.id
      });

      return gateway;
    }
  });
};
