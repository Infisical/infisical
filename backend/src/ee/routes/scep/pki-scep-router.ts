import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";

const MAX_SCEP_MESSAGE_SIZE = 64 * 1024; // 64KB

export const registerPkiScepRouter = async (server: FastifyZodProvider) => {
  const bufferParser = (_req: unknown, body: Buffer, done: (err: null, result: Buffer) => void) => {
    done(null, body);
  };
  const parserOpts = { parseAs: "buffer" as const, bodyLimit: MAX_SCEP_MESSAGE_SIZE };

  server.addContentTypeParser("application/x-pki-message", parserOpts, bufferParser);
  server.addContentTypeParser("application/octet-stream", parserOpts, bufferParser);

  // SCEP clients may send POST without a Content-Type header — normalize before body parsing
  server.addHook("onRequest", async (req) => {
    if (
      req.method === "POST" &&
      (!req.headers["content-type"] || req.headers["content-type"] === "application/octet-stream")
    ) {
      // eslint-disable-next-line no-param-reassign
      req.headers["content-type"] = "application/x-pki-message";
    }
  });

  server.route({
    method: "GET",
    url: "/:profileId/pkiclient.exe",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        profileId: z.string().uuid()
      }),
      querystring: z.object({
        operation: z.string(),
        message: z.string().optional()
      })
    },
    handler: async (req, res) => {
      const { profileId } = req.params;
      const { operation, message: messageBase64 } = req.query;

      switch (operation) {
        case "GetCACaps": {
          const caps = await server.services.pkiScep.getCaCaps({ profileId });
          void res.header("Content-Type", "text/plain");
          return caps;
        }

        case "GetCACert": {
          const certBundle = await server.services.pkiScep.getCaCert({ profileId });
          void res.header("Content-Type", "application/x-x509-ca-ra-cert");
          return res.send(certBundle);
        }

        case "PKIOperation": {
          if (!messageBase64) {
            throw new BadRequestError({ message: "Missing message parameter for PKIOperation" });
          }
          const messageBuffer = Buffer.from(messageBase64, "base64");
          const clientIp = req.ip || "unknown";

          const response = await server.services.pkiScep.handlePkiOperation({
            profileId,
            message: messageBuffer,
            clientIp
          });

          void res.header("Content-Type", "application/x-pki-message");
          return res.send(response);
        }

        default:
          throw new BadRequestError({ message: `Unsupported SCEP operation: ${operation}` });
      }
    }
  });

  server.route({
    method: "POST",
    url: "/:profileId/pkiclient.exe",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        profileId: z.string().uuid()
      }),
      querystring: z.object({
        operation: z.string().optional()
      })
    },
    handler: async (req, res) => {
      const { profileId } = req.params;
      const clientIp = req.ip || "unknown";
      const body = req.body as Buffer;

      if (!body || body.length === 0) {
        throw new BadRequestError({ message: "Empty PKIOperation request body" });
      }

      const response = await server.services.pkiScep.handlePkiOperation({
        profileId,
        message: body,
        clientIp
      });

      void res.header("Content-Type", "application/x-pki-message");
      return res.send(response);
    }
  });
};
