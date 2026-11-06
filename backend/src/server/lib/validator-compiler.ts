import { FastifySchemaCompiler } from "fastify";
import { z } from "zod";

// Hands Fastify the ZodError itself, so the 422 body keeps Zod's issue paths with numeric array indices.
// The @fastify/type-provider-zod compiler flattens each path into a "/"-joined string.
export const validatorCompiler: FastifySchemaCompiler<z.ZodType> =
  ({ schema }) =>
  (data) => {
    const result = z.safeDecode(schema, data);
    return result.success ? { value: result.data } : { error: result.error };
  };
