import { readLimit } from "@app/server/config/rateLimiter";

// The SSH and Agent Sentinel (AI MCP) products were removed (ENG-5432), but shipped
// clients still call their endpoints: the Infisical CLI's `infisical ssh` commands
// (via go-sdk) hit /api/v1/ssh/*, and MCP clients hit /api/v1/ai/mcp/*. A bare 404
// gives those users no hint the product is gone, so the old prefixes answer
// 410 Gone with an explanation instead.
//
// Deliberately unauthenticated: the response reveals nothing, performs no work, and
// must reach clients whose tokens are expired or invalid. Remove together with the
// deprecated permission subjects (see ProjectPermissionV2Schema) in a future
// breaking release.
export const registerRemovedProductTombstoneRouter =
  (message: string) => async (server: FastifyZodProvider) => {
    server.route({
      method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      url: "/*",
      config: {
        rateLimit: readLimit
      },
      schema: {
        hide: true
      },
      handler: async (req, res) => {
        void res.status(410).send({
          reqId: req.id,
          statusCode: 410,
          error: "Gone",
          message
        });
      }
    });
  };
