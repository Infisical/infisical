import { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import { Logger } from "pino";

import { ZodTypeProvider } from "@app/server/plugins/fastify-zod";

declare global {
  type FastifyZodProvider = FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression<RawServerDefault>,
    RawReplyDefaultExpression<RawServerDefault>,
    Readonly<Logger>,
    ZodTypeProvider
  >;

  // used only for testing
  const testServer: FastifyZodProvider;
  const jwtAuthToken: string;
}
