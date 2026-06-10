import { FastifyInstance } from "fastify";

// Hands a plugin a server whose route() bakes `prefix` into the URL instead of relying on an
// encapsulated context. Avoids creating a Fastify context per destination (hundreds at boot),
// which previously overflowed the call stack during the onReady walk. Safe only for plugins
// that exclusively call route() — no addHook/decorate/register (true for all destination routers).
export const withRoutePrefix = (server: FastifyInstance, prefix: string): FastifyZodProvider => {
  const scoped: FastifyZodProvider = Object.create(server) as FastifyZodProvider;
  scoped.route = ((opts: Parameters<FastifyZodProvider["route"]>[0]) => {
    (server as unknown as FastifyZodProvider).route({
      ...opts,
      url: opts.url === "/" ? prefix : `${prefix}${opts.url}`
    });
    return scoped;
  }) as FastifyZodProvider["route"];
  return scoped;
};
