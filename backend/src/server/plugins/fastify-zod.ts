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
  validator: this["schema"] extends ZodTypeAny ? z.output<this["schema"]> : unknown;
  serializer: this["schema"] extends ZodTypeAny ? z.input<this["schema"]> : unknown;
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

/**
 * Normalizes a JSON schema for OpenAPI output.
 *
 * Two jobs. It removes properties marked with "x-hidden": true, so a field can be
 * hidden from the docs while still being validated
 * (usage: .describe(JSON.stringify({ "x-hidden": true }))). And it flattens JSON
 * Schema tuple form, which zod-to-json-schema emits for z.tuple() even under its
 * openApi3 target: OpenAPI 3.0 has no tuple type and requires `items` to be a single
 * schema, so a spec containing one fails to parse in any standard OpenAPI parser.
 *
 * keepHidden suppresses only the first job. The tuple flattening is unconditional,
 * because it is about producing valid OpenAPI rather than about hiding anything.
 */
const removeHiddenProperties = (schema: FreeformRecord, keepHidden = false): FreeformRecord => {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const result = { ...schema };

  if (result.properties && typeof result.properties === "object") {
    const filteredProperties: FreeformRecord = {};
    const hiddenKeys: string[] = [];

    for (const key of Object.keys(result.properties)) {
      const prop = result.properties[key];
      if (!keepHidden && prop?.["x-hidden"]) {
        hiddenKeys.push(key);
      } else {
        filteredProperties[key] = removeHiddenProperties(prop, keepHidden);
      }
    }

    result.properties = filteredProperties;

    if (result.required && Array.isArray(result.required)) {
      result.required = result.required.filter((r: string) => !hiddenKeys.includes(r));
      if (result.required.length === 0) {
        delete result.required;
      }
    }
  }

  if (Array.isArray(result.items)) {
    const variants = (result.items as FreeformRecord[]).map((v) => removeHiddenProperties(v, keepHidden));
    if (result.additionalItems && typeof result.additionalItems === "object") {
      const rest = removeHiddenProperties(result.additionalItems, keepHidden);
      if (Object.keys(rest).length > 0) variants.push(rest);
    }
    delete result.additionalItems;
    const unique = variants.filter((v, i, arr) => arr.findIndex((x) => JSON.stringify(x) === JSON.stringify(v)) === i);
    result.items = unique.length === 1 ? unique[0] : { oneOf: unique };
  } else if (result.items) {
    result.items = removeHiddenProperties(result.items, keepHidden);
  }

  if (result.allOf && Array.isArray(result.allOf)) {
    result.allOf = result.allOf.map((v: FreeformRecord) => removeHiddenProperties(v, keepHidden));
  }

  if (result.oneOf && Array.isArray(result.oneOf)) {
    result.oneOf = result.oneOf.map((v: FreeformRecord) => removeHiddenProperties(v, keepHidden));
  }

  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map((v: FreeformRecord) => removeHiddenProperties(v, keepHidden));
  }

  return result;
};

/**
 * Recursively strips a named property (and references in `required`) from every nested object schema.
 * Used to elide auto-resolved fields (e.g. `projectId` on Cert Manager routes) from the OpenAPI spec
 * even though they remain part of the runtime response.
 */
const stripPropertyDeep = (schema: FreeformRecord, propertyName: string): FreeformRecord => {
  if (!schema || typeof schema !== "object") return schema;
  const result: FreeformRecord = Array.isArray(schema) ? [...schema] : { ...schema };

  if (Array.isArray(result)) {
    return result.map((item) => stripPropertyDeep(item, propertyName));
  }

  if (result.properties && typeof result.properties === "object" && result.properties[propertyName]) {
    const next: FreeformRecord = {};
    for (const key of Object.keys(result.properties)) {
      if (key !== propertyName) next[key] = stripPropertyDeep(result.properties[key], propertyName);
    }
    result.properties = next;
    if (Array.isArray(result.required)) {
      result.required = result.required.filter((r: string) => r !== propertyName);
      if (result.required.length === 0) delete result.required;
    }
  } else if (result.properties && typeof result.properties === "object") {
    const next: FreeformRecord = {};
    for (const key of Object.keys(result.properties)) {
      next[key] = stripPropertyDeep(result.properties[key], propertyName);
    }
    result.properties = next;
  }

  if (result.items) {
    result.items = stripPropertyDeep(result.items, propertyName);
  }
  if (Array.isArray(result.allOf)) result.allOf = result.allOf.map((s: FreeformRecord) => stripPropertyDeep(s, propertyName));
  if (Array.isArray(result.oneOf)) result.oneOf = result.oneOf.map((s: FreeformRecord) => stripPropertyDeep(s, propertyName));
  if (Array.isArray(result.anyOf)) result.anyOf = result.anyOf.map((s: FreeformRecord) => stripPropertyDeep(s, propertyName));

  return result;
};

const CERT_MANAGER_URL_PREFIXES = ["/api/v1/cert-manager/"];
const isCertManagerUrl = (url: string) => CERT_MANAGER_URL_PREFIXES.some((p) => url.startsWith(p));

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

export const createJsonSchemaTransform = ({ skipList, full = false }: { skipList: readonly string[]; full?: boolean }) => {
  return ({ schema = {}, url }: { schema: Schema; url: string }) => {
    if (!schema) {
      return {
        schema: { hide: true },
        url
      };
    }

    // Routes are hidden by default, so the published spec only carries what a route
    // explicitly opted into. `full` lifts every suppression below, which is what lets
    // a client be generated for the complete surface outside production.
    if (typeof schema.hide === "undefined") {
      schema.hide = !full;
    }
    const { response, headers, querystring, body, params, hide, ...rest } = schema;

    const transformed: FreeformRecord = {};

    if (!full && (skipList.includes(url) || hide)) {
      transformed.hide = true;
      return { schema: transformed, url };
    }

    const zodSchemas: FreeformRecord = { headers, querystring, body, params };

    for (const prop in zodSchemas) {
      const zodSchema = zodSchemas[prop];
      if (zodSchema) {
        transformed[prop] = removeHiddenProperties(zodToJsonSchema(zodSchema, zodToJsonSchemaOptions), full);
      }
    }

    if (response) {
      transformed.response = {};
      const stripProjectId = !full && isCertManagerUrl(url);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const prop in response as any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const schema = resolveSchema((response as any)[prop]);

        let transformedResponse = removeHiddenProperties(
          zodToJsonSchema(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            schema as any,
            zodToJsonSchemaOptions
          ),
          full
        );
        if (stripProjectId) {
          transformedResponse = stripPropertyDeep(transformedResponse, "projectId");
        }
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

export const fullJsonSchemaTransform = createJsonSchemaTransform({
  skipList: defaultSkipList,
  full: true
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
