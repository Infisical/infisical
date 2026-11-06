/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, no-underscore-dangle */
// These helpers rewrite untyped JSON Schema produced by z.toJSONSchema.
import { createJsonSchemaTransform, createJsonSchemaTransformObject } from "@fastify/type-provider-zod";
import { FastifySchema } from "fastify";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FreeformRecord = Record<string, any>;

const NON_OPENAPI_STRING_FORMATS = new Set(["starts_with", "ends_with", "includes", "regex", "lowercase", "uppercase"]);

const OPENAPI_FORMAT_BY_ZOD_FORMAT: Record<string, string> = {
  url: "uri",
  email: "email",
  uuid: "uuid",
  guid: "uuid",
  datetime: "date-time",
  date: "date",
  ipv4: "ipv4",
  ipv6: "ipv6"
};

// Zod 4 writes only the last string format, so .url().startsWith(...) documents as starts_with.
const firstOpenApiFormat = (def: FreeformRecord): string | undefined =>
  (def.checks ?? [])
    .map((check: FreeformRecord) => OPENAPI_FORMAT_BY_ZOD_FORMAT[check?._zod?.def?.format])
    .find(Boolean);

// Otherwise the pattern is Zod's own regex for the format, which the format already says.
const hasCustomPattern = (def: FreeformRecord) =>
  (def.checks ?? []).some((check: FreeformRecord) => NON_OPENAPI_STRING_FORMATS.has(check?._zod?.def?.format));

const overrideJsonSchema = (ctx: { zodSchema: { _zod: { def: FreeformRecord } }; jsonSchema: FreeformRecord }) => {
  const { def } = ctx.zodSchema._zod;
  const { jsonSchema } = ctx;

  // Zod drops a default from the input schema when the field transforms (booleanSchema, for one).
  if (def.type === "default") {
    try {
      jsonSchema.default = JSON.parse(JSON.stringify(def.defaultValue)) as unknown;
    } catch {
      // undefined and bigint defaults have no JSON form
    }
  }

  if (def.type === "date") Object.assign(jsonSchema, { type: "string", format: "date-time" });
  if (def.type === "bigint") Object.assign(jsonSchema, { type: "integer", format: "int64" });

  if (typeof jsonSchema.format === "string" && NON_OPENAPI_STRING_FORMATS.has(jsonSchema.format)) {
    const format = firstOpenApiFormat(def);
    if (format) jsonSchema.format = format;
    else delete jsonSchema.format;
  } else if (typeof jsonSchema.format === "string" && jsonSchema.pattern && !hasCustomPattern(def)) {
    delete jsonSchema.pattern;
  }
  if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum;
  if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum;

  const { description } = jsonSchema;
  if (description === "") delete jsonSchema.description;
  if (typeof description === "string" && description.startsWith("{")) {
    try {
      const parsed = JSON.parse(description) as FreeformRecord;
      delete jsonSchema.description;
      Object.assign(jsonSchema, parsed);
    } catch {
      // not a JSON description, keep it as plain text
    }
  }
};

/**
 * Removes properties and union variants marked with "x-hidden": true, so a field or variant can be
 * hidden from the docs while still being validated. Usage: .describe(JSON.stringify({ "x-hidden": true }))
 *
 * It also flattens JSON Schema tuple form: OpenAPI 3.0 has no tuple type and requires `items` to be a
 * single schema. keepHidden suppresses only the hiding, because the flattening is about producing valid
 * OpenAPI rather than about hiding anything.
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

  const visibleVariants = (variants: FreeformRecord[]) =>
    variants
      .filter((v) => keepHidden || !v?.["x-hidden"])
      .map((v: FreeformRecord) => removeHiddenProperties(v, keepHidden));

  if (result.oneOf && Array.isArray(result.oneOf)) {
    result.oneOf = visibleVariants(result.oneOf);
  }

  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = visibleVariants(result.anyOf);
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
  if (Array.isArray(result.allOf))
    result.allOf = result.allOf.map((s: FreeformRecord) => stripPropertyDeep(s, propertyName));
  if (Array.isArray(result.oneOf))
    result.oneOf = result.oneOf.map((s: FreeformRecord) => stripPropertyDeep(s, propertyName));
  if (Array.isArray(result.anyOf))
    result.anyOf = result.anyOf.map((s: FreeformRecord) => stripPropertyDeep(s, propertyName));

  return result;
};

const CERT_MANAGER_URL_PREFIXES = ["/api/v1/cert-manager/"];
const isCertManagerUrl = (url: string) => CERT_MANAGER_URL_PREFIXES.some((p) => url.startsWith(p));

const zodToJsonConfig = { override: overrideJsonSchema as never };

const upstreamJsonSchemaTransform = createJsonSchemaTransform({ zodToJsonConfig });
export const jsonSchemaTransformObject = createJsonSchemaTransformObject({ zodToJsonConfig });

type TJsonSchemaTransform = typeof upstreamJsonSchemaTransform;

// Routes are hidden by default, so the published spec only carries what a route explicitly opted into.
// `full` lifts every suppression, which is what lets a client be generated for the complete surface
// outside production.
const createInfisicalJsonSchemaTransform =
  ({ full }: { full: boolean }): TJsonSchemaTransform =>
  (document) => {
    const schema = document.schema as (FastifySchema & { hide?: boolean }) | undefined;
    if (!schema) return { schema: { hide: !full }, url: document.url } as ReturnType<TJsonSchemaTransform>;
    if (typeof schema.hide === "undefined") schema.hide = true;

    const result = upstreamJsonSchemaTransform(full ? { ...document, schema: { ...schema, hide: false } } : document);
    const transformed = result.schema as FreeformRecord;
    if (!transformed || transformed.hide) return result;

    for (const part of ["headers", "querystring", "body", "params"]) {
      if (transformed[part]) transformed[part] = removeHiddenProperties(transformed[part], full);
    }
    if (transformed.response) {
      const stripProjectId = !full && isCertManagerUrl(document.url);
      for (const status of Object.keys(transformed.response)) {
        let responseSchema = removeHiddenProperties(transformed.response[status], full);
        if (stripProjectId) responseSchema = stripPropertyDeep(responseSchema, "projectId");
        transformed.response[status] = responseSchema;
      }
    }
    return result;
  };

export const jsonSchemaTransform = createInfisicalJsonSchemaTransform({ full: false });

export const fullJsonSchemaTransform = createInfisicalJsonSchemaTransform({ full: true });
