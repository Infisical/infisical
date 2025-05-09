/* eslint-disable */
// Code taken from https://www.npmjs.com/package/fastify-type-provider-zod
// Full credits goes to https://github.com/turkerdev
// Code taken to keep in in house
import type { FastifySchema, FastifySchemaCompiler, FastifyTypeProvider } from "fastify";
import type { FastifySerializerCompiler } from "fastify/types/schema";
import type { z, ZodAny, ZodTypeAny } from "zod";
import { PostProcessCallback, zodToJsonSchema } from "zod-to-json-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FreeformRecord = Record<string, any>;

const defaultSkipList = [
  "/documentation/",
  "/documentation/initOAuth",
  "/documentation/json",
  "/documentation/uiConfig",
  "/documentation/yaml",
  "/documentation/*",
  "/documentation/static/*"
];

export interface ZodTypeProvider extends FastifyTypeProvider {
  output: this["input"] extends ZodTypeAny ? z.infer<this["input"]> : never;
}

interface Schema extends FastifySchema {
  hide?: boolean;
}

// Credit: https://github.com/StefanTerdell/zod-to-json-schema
const jsonDescription: PostProcessCallback = (jsonSchema, def) => {
  if (def.description) {
    try {
      return {
        ...jsonSchema,
        description: undefined,
        ...JSON.parse(def.description)
      };
    } catch {}
  }

  return jsonSchema;
};

const zodToJsonSchemaOptions = {
  target: "openApi3",
  $refStrategy: "none",
  postProcess: jsonDescription
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasOwnProperty<T, K extends PropertyKey>(obj: T, prop: K): obj is T & Record<K, any> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function resolveSchema(maybeSchema: ZodAny | { properties: ZodAny }): Pick<ZodAny, "safeParse"> {
  if (hasOwnProperty(maybeSchema, "safeParse")) {
    return maybeSchema;
  }
  if (hasOwnProperty(maybeSchema, "properties")) {
    return maybeSchema.properties;
  }
  throw new Error(`Invalid schema passed: ${JSON.stringify(maybeSchema)}`);
}

export const createJsonSchemaTransform = ({ skipList }: { skipList: readonly string[] }) => {
  return ({ schema = {}, url }: { schema: Schema; url: string }) => {
    if (!schema) {
      return {
        schema: { hide: true },
        url
      };
    }

    if (typeof schema.hide === "undefined") {
      schema.hide = true;
    }
    const { response, headers, querystring, body, params, hide, ...rest } = schema;

    const transformed: FreeformRecord = {};

    if (skipList.includes(url) || hide) {
      transformed.hide = true;
      return { schema: transformed, url };
    }

    const zodSchemas: FreeformRecord = { headers, querystring, body, params };

    for (const prop in zodSchemas) {
      const zodSchema = zodSchemas[prop];
      if (zodSchema) {
        transformed[prop] = zodToJsonSchema(zodSchema, zodToJsonSchemaOptions);
      }
    }

    if (response) {
      transformed.response = {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const prop in response as any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const schema = resolveSchema((response as any)[prop]);

        const transformedResponse = zodToJsonSchema(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          schema as any,
          zodToJsonSchemaOptions
        );
        transformed.response[prop] = transformedResponse;
      }
    }

    for (const prop in rest) {
      const meta = rest[prop as keyof typeof rest];
      if (meta) {
        transformed[prop] = meta;
      }
    }

    return { schema: transformed, url };
  };
};

export const jsonSchemaTransform = createJsonSchemaTransform({
  skipList: defaultSkipList
});

export const validatorCompiler: FastifySchemaCompiler<ZodAny> =
  ({ schema }) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data): any => {
    try {
      return { value: schema.parse(data) };
    } catch (error) {
      return { error };
    }
  };

export class ResponseValidationError extends Error {
  public details: FreeformRecord;

  constructor(validationResult: FreeformRecord) {
    super("Response doesn't match the schema");
    this.name = "ResponseValidationError";
    this.details = validationResult.error;
  }
}

export const serializerCompiler: FastifySerializerCompiler<ZodAny | { properties: ZodAny }> =
  ({ schema: maybeSchema }) =>
  (data) => {
    const schema: Pick<ZodAny, "safeParse"> = resolveSchema(maybeSchema);

    const result = schema.safeParse(data);
    if (result.success) {
      return JSON.stringify(result.data);
    }

    throw new ResponseValidationError(result);
  };
