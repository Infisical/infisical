import { InvalidSchemaError, ResponseSerializationError } from "@fastify/type-provider-zod";
import fastJsonStringify, { type Schema as FastJsonSchema } from "fast-json-stringify";
import { FastifySerializerCompiler } from "fastify/types/schema";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
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

const fastJsonOverride = (ctx: { zodSchema: z.core.$ZodType; jsonSchema: Record<string, unknown> }) => {
  if (ctx.zodSchema instanceof z.core.$ZodDate) Object.assign(ctx.jsonSchema, { type: "string", format: "date-time" });
  if (ctx.zodSchema instanceof z.core.$ZodBigInt) Object.assign(ctx.jsonSchema, { type: "integer" });
};

// For large responses: compiles the schema once instead of running Zod over every response.
// fast-json-stringify writes only the properties the schema lists, so unlisted fields are still dropped.
// Fastify types a route-level compiler with the whole route schema, but calls it with each status's response schema.
export const fastJsonSerializerCompiler: FastifySerializerCompiler<unknown> = (routeSchema) => {
  const responseRouteSchema = routeSchema as Parameters<ReturnType<typeof createSerializerCompiler>>[0];
  if (!routeSchema.httpStatus?.startsWith("2")) {
    return createSerializerCompiler({ legacyParseFallback: Boolean(getConfig()?.isProductionMode) })(
      responseRouteSchema
    );
  }

  const jsonSchema = z.toJSONSchema(resolveResponseSchema(responseRouteSchema.schema), {
    target: "draft-7",
    io: "input",
    unrepresentable: "any",
    override: fastJsonOverride
  });
  return fastJsonStringify(jsonSchema as FastJsonSchema);
};
