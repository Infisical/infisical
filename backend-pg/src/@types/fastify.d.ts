import { ZodTypeProvider } from "@app/server/plugins/fastify-zod";

import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    realIp: string;
  }
}

declare global {
  type FastifyZodProvider = FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression<RawServerDefault>,
    RawReplyDefaultExpression<RawServerDefault>,
    FastifyBaseLogger,
    ZodTypeProvider
  >;
}
