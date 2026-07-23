import replyFrom from "@fastify/reply-from";
import fp from "fastify-plugin";

export const forwardWritesToPrimary = fp(async (server, opt: { primaryUrl: string }) => {
  await server.register(replyFrom, {
    base: opt.primaryUrl
  });

  // reply-from only re-encodes parsed JSON bodies; every other content type must stay a raw
  // stream so it can be piped to the primary byte-for-byte (e.g. SAML callback form posts).
  // Safe on replicas: all /api writes are forwarded, so no local route needs a parsed form body.
  server.removeContentTypeParser("application/x-www-form-urlencoded");
  server.addContentTypeParser("application/x-www-form-urlencoded", (_req, payload, done) => done(null, payload));

  server.addHook("preValidation", async (request, reply) => {
    if (request.url.startsWith("/api") && ["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
      return reply.from(request.url);
    }
  });
});
