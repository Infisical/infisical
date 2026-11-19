import fastifyEtag from "@fastify/etag";
import fp from "fastify-plugin";

// @fastify/etag turns a 200 into a 304 when the body hashes to If-None-Match, but keeps the 200's Content-Type.
// A 304 has no body (RFC 9110 15.4.5), and clients generated from our OpenAPI spec try to parse one whenever the
// type is JSON, so they fail on it. The hook is added after the plugin's, so it runs after it.
export const etag = fp(async (server) => {
  await server.register(fastifyEtag);
  server.addHook("onSend", async (_req, reply, payload) => {
    if (reply.statusCode === 304) reply.removeHeader("content-type");
    return payload;
  });
});
