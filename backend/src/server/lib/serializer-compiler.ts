import { InvalidSchemaError, ResponseSerializationError } from "@fastify/type-provider-zod";
import { FastifySerializerCompiler } from "fastify/types/schema";
import { z } from "zod";

import { logger } from "@app/lib/logger";
import { recordResponseSerializationFallbackMetric } from "@app/lib/telemetry/metrics";

type TResponseSchema = z.core.$ZodType | { properties: z.core.$ZodType };

const resolveResponseSchema = (schema: TResponseSchema) => {
  if (schema instanceof z.core.$ZodType) return schema;
  if ("properties" in schema && schema.properties instanceof z.core.$ZodType) return schema.properties;
  throw new InvalidSchemaError(JSON.stringify(schema));
};

// z.encode never fills a .default(), so a handler that omits a defaulted field fails to serialize, where
// Zod 3's parse filled it in. legacyParseFallback retries with that parse so a mis-typed query degrades to
// the old behavior with a warning instead of a 500. Keep it off outside production so tests surface these.
export const createSerializerCompiler =
  ({ legacyParseFallback }: { legacyParseFallback: boolean }): FastifySerializerCompiler<TResponseSchema> =>
  ({ schema, method, url }) => {
    const responseSchema = resolveResponseSchema(schema);
    return (data) => {
      const encoded = z.safeEncode(responseSchema, data);
      if (encoded.success) return JSON.stringify(encoded.data);

      if (legacyParseFallback) {
        const parsed = z.safeParse(responseSchema, data);
        if (parsed.success) {
          const fields = encoded.error.issues
            .map((issue) => `${issue.path.join(".") || "(root)"} (${issue.code})`)
            .join(", ");
          logger.warn(
            `Response did not match its schema and was served by the Zod 3 parse fallback [method=${method}] [route=${url}] [fields=${fields}]`
          );
          recordResponseSerializationFallbackMetric({ method, route: url });
          return JSON.stringify(parsed.data);
        }
      }

      throw new ResponseSerializationError(method, url, { cause: encoded.error });
    };
  };
