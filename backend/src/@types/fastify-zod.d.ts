import { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";

import { TCryptographyFactory } from "@app/lib/crypto/cryptography";
import { CustomLogger } from "@app/lib/logger/logger";
import { ZodTypeProvider } from "@app/server/plugins/fastify-zod";

declare global {
  type FastifyZodProvider = FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression<RawServerDefault>,
    RawReplyDefaultExpression<RawServerDefault>,
    Readonly<CustomLogger>,
    ZodTypeProvider
  >;

  // used only for testing
  const testServer: FastifyZodProvider;
  const testCryptoProvider: TCryptographyFactory;
  const jwtAuthToken: string;
}
