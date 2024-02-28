import { z } from "zod";

import { logger } from "@app/lib/logger";

export const registerServersideEventsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/events/:projectId",
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.string()
      }
    },
    //  onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, res) => {
      res.sse({
        data: JSON.stringify({
          message: "Connected to event stream"
        })
      });

      const subscription = await server.services.event.crateSubscription(req.params.projectId);

      // It's OK to create a event listener here, because it's tied to the local subscription instance. So once the function ends, the listener is removed along with the subscription.
      // No need to worry about memory leaks!
      subscription
        .on("message", (channel, message) => {
          if (channel === req.params.projectId)
            res.sse({
              data: JSON.stringify(message)
            });
        })
        .on("error", (error) => {
          logger.error(error, "Error in subscription");
          res.sse({
            error: true,
            errorMessage: error.message // ? Should we really return the error message to the client?
          });
        });

      // eslint-disable-next-line @typescript-eslint/return-await, @typescript-eslint/no-misused-promises
      req.socket.on("close", async () => await subscription.unsubscribe());
    }
  });
};
