import replyFrom from "@fastify/reply-from";
import fp from "fastify-plugin";

export const forwardWritesToPrimary = fp(async (server, opt: { primaryUrl: string }) => {
  await server.register(replyFrom, {
    base: opt.primaryUrl
  });

  server.addHook("preValidation", async (request, reply) => {
    if (request.url.startsWith("/api") && ["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
      return reply.from(request.url);
    }
  });
});
