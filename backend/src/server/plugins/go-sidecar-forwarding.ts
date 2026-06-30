import replyFrom from "@fastify/reply-from";
import fp from "fastify-plugin";

// Method + URL combinations to forward to the Go sidecar
const FORWARDED_ROUTES: { method: string; url: string }[] = [
  // { method: "GET", url: "/api/v3/secrets/raw/:secretName" },
  // { method: "GET", url: "/api/v3/secrets/raw" },
  { method: "GET", url: "/api/v4/secrets" },
  { method: "GET", url: "/api/v4/secrets/:secretName" }
];

export const forwardToGoSidecar = fp(async (server, opt: { sidecarUrl: string }) => {
  await server.register(replyFrom, {
    base: opt.sidecarUrl
  });

  const routeSet = new Set(FORWARDED_ROUTES.map((r) => `${r.method}:${r.url}`));

  server.addHook("onRequest", async (request, reply) => {
    const key = `${request.method}:${request.routeOptions.url}`;
    if (routeSet.has(key)) {
      return reply.from(request.url, {
        rewriteRequestHeaders: (_req, headers) => ({
          ...headers,
          "X-Request-Id": request.id,
          "X-Real-Ip": request.realIp
        })
      });
    }
  });
});
