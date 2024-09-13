/* eslint-disable @typescript-eslint/no-floating-promises */
import { z } from "zod";

import { CA_CRLS } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";

export const registerCaCrlRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:crlId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get CRL in DER format (deprecated)",
      params: z.object({
        crlId: z.string().trim().describe(CA_CRLS.GET.crlId)
      }),
      response: {
        200: z.instanceof(Buffer)
      }
    },
    handler: async (req, res) => {
      const { crl } = await server.services.certificateAuthorityCrl.getCrlById(req.params.crlId);

      res.header("Content-Type", "application/pkix-crl");

      return Buffer.from(crl);
    }
  });

  server.route({
    method: "GET",
    url: "/:crlId/der",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get CRL in DER format",
      params: z.object({
        crlId: z.string().trim().describe(CA_CRLS.GET.crlId)
      }),
      response: {
        200: z.instanceof(Buffer)
      }
    },
    handler: async (req, res) => {
      const { crl } = await server.services.certificateAuthorityCrl.getCrlById(req.params.crlId);

      res.header("Content-Type", "application/pkix-crl");

      return Buffer.from(crl);
    }
  });
};
