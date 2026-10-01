/* eslint-disable no-underscore-dangle, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
import { readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

import cookie from "@fastify/cookie";
import fastifyFormBody from "@fastify/formbody";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@fastify/type-provider-zod";
import websocket from "@fastify/websocket";
import Fastify, { RouteOptions } from "fastify";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { registerV1EERoutes } from "@app/ee/routes/v1";
import { registerV2EERoutes } from "@app/ee/routes/v2";
import { registerV3EERoutes } from "@app/ee/routes/v3";
import { initEnvConfig } from "@app/lib/config/env";
import { bidirectionalTransform, partialWithoutDefaults } from "@app/lib/zod";
import { registerV1Routes } from "@app/server/routes/v1";
import { registerV2Routes } from "@app/server/routes/v2";
import { registerV3Routes } from "@app/server/routes/v3";
import { registerV4Routes } from "@app/server/routes/v4";

const REQUIRED_ENV_DEFAULTS: Record<string, string> = {
  DB_CONNECTION_URI: "postgres://infisical:infisical@localhost:5432/infisical",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "zod-schema-guards-test-secret",
  ENCRYPTION_KEY: "6c1fe4e407b8911c104518103505b218"
};

// Handlers are never invoked; route registration only needs these to exist.
const anyDependency: unknown = new Proxy(() => anyDependency, {
  get: (_target, key) => (key === "then" ? undefined : anyDependency),
  apply: () => anyDependency
});

const routes: RouteOptions[] = [];

type TNodeContext = { path: string; insideOptional: boolean };
type TSchemaPart = "body" | "querystring" | "params" | "headers" | "response";

// Visits every schema reachable from root. insideOptional resets at each object field, because a
// field's own wrappers decide whether that field can be omitted.
const walkSchema = (root: unknown, onNode: (node: any, context: TNodeContext) => void) => {
  const visit = (node: any, context: TNodeContext, ancestors: Set<unknown>) => {
    if (!node?._zod || ancestors.has(node)) return;
    const next = new Set(ancestors).add(node);
    const { def } = node._zod;
    onNode(node, context);

    const wrapped = { path: context.path, insideOptional: context.insideOptional || def.type === "optional" };
    [def.innerType, def.in, def.out, def.left, def.right, ...(def.options ?? []), ...(def.items ?? [])].forEach(
      (child) => visit(child, wrapped, next)
    );
    Object.entries(def.shape ?? {}).forEach(([key, child]) =>
      visit(child, { path: context.path ? `${context.path}.${key}` : key, insideOptional: false }, next)
    );
    if (def.element) visit(def.element, { path: `${context.path}[]`, insideOptional: false }, next);
    if (def.keyType) visit(def.keyType, { path: `${context.path}{key}`, insideOptional: false }, next);
    if (def.valueType) visit(def.valueType, { path: `${context.path}{*}`, insideOptional: false }, next);
    if (def.type === "lazy") visit(def.getter(), context, next);
  };
  visit(root, { path: "", insideOptional: false }, new Set());
};

const containsTransform = (root: unknown) => {
  let found = false;
  walkSchema(root, (node) => {
    if (node._zod.def.type === "transform") found = true;
  });
  return found;
};

type TGuardRule = {
  name: string;
  parts: TSchemaPart[];
  explanation: string;
  isOffender: (node: any, context: TNodeContext) => boolean;
};

const REQUEST_PARTS: TSchemaPart[] = ["body", "querystring", "params", "headers"];
const ALL_PARTS: TSchemaPart[] = [...REQUEST_PARTS, "response"];

const RULES: TGuardRule[] = [
  {
    name: "responses never reach a one-way transform",
    parts: ["response"],
    explanation: [
      "Responses are serialized with z.safeEncode, which runs the schema backwards and throws on a one-way",
      ".transform() or z.preprocess, so the route would answer every call with a 500. Zod 3 parsed responses",
      "forwards, which is why these used to work. Use bidirectionalTransform from @app/lib/zod, or do the",
      "conversion in the handler."
    ].join("\n"),
    isOffender: (node) => node._zod.def.type === "transform"
  },
  {
    name: "requests never apply a default to an omitted optional field",
    parts: ["body", "querystring"],
    explanation: [
      "Zod 4 applies a .default() even when it is wrapped in .optional() or .partial(); Zod 3 never did. An",
      "update body would reset every defaulted field the caller left out. Use partialWithoutDefaults or",
      "withoutDefault from @app/lib/zod, or drop the dead default."
    ].join("\n"),
    isOffender: (node, { insideOptional }) => node._zod.def.type === "default" && insideOptional
  },
  {
    name: "records keyed by an enum do not require every key",
    parts: ALL_PARTS,
    explanation: [
      "Zod 4 makes z.record(z.enum([...]), value) exhaustive: every enum key must be present. Zod 3 treated",
      "each key as optional, so a request sending only some keys now fails with a 422 and a response",
      "missing one fails to serialize. Use z.partialRecord(...) unless every key really is required."
    ].join("\n"),
    isOffender: (node) =>
      node._zod.def.type === "record" &&
      ["enum", "literal", "union"].includes(node._zod.def.keyType?._zod?.def?.type) &&
      !node.safeParse({}).success
  },
  {
    name: "IDs are validated with .guid(), not .uuid()",
    parts: ALL_PARTS,
    explanation: [
      "Zod 4's .uuid() enforces the RFC 9562 version and variant bits, so it rejects IDs that Zod 3 accepted",
      "and that the API has always issued. In a request that is a 422; in a response it fails serialization",
      "with a 500. Use .guid(), which matches Zod 3's .uuid()."
    ].join("\n"),
    isOffender: (node) =>
      node._zod.def.format === "uuid" ||
      (node._zod.def.checks ?? []).some((check: any) => check?._zod?.def?.format === "uuid")
  },
  {
    name: "request defaults that need the schema's transform use .prefault()",
    parts: REQUEST_PARTS,
    explanation: [
      "Zod 3 ran a .default() value through the schema, so its transforms and checks applied to it. Zod 4",
      "returns the default as-is, so this field now receives a different value when the caller omits it.",
      "Use .prefault(value) to keep the Zod 3 behavior, or set the default to the already-transformed value."
    ].join("\n"),
    isOffender: (node) => {
      const { def } = node._zod;
      if (def.type !== "default" || !containsTransform(def.innerType)) return false;
      const { defaultValue } = def;
      const result = def.innerType.safeParse(structuredClone(defaultValue));
      return !result.success || !isDeepStrictEqual(result.data, defaultValue);
    }
  }
];

const schemasOf = (route: RouteOptions, part: TSchemaPart): [string, unknown][] => {
  const schema = (route.schema ?? {}) as Record<string, any>;
  if (part !== "response") return [[part, schema[part]]];
  return Object.entries(schema.response ?? {}).map(([status, response]) => [`response ${status}`, response]);
};

const offendingPaths = (rule: TGuardRule, root: unknown) => {
  const paths = new Set<string>();
  walkSchema(root, (node, context) => {
    if (rule.isOffender(node, context)) paths.add(context.path || "(root)");
  });
  return [...paths];
};

const findOffenders = (rule: TGuardRule) =>
  routes.flatMap((route) =>
    rule.parts.flatMap((part) =>
      schemasOf(route, part).flatMap(([label, root]) =>
        offendingPaths(rule, root).map((path) => `${String(route.method)} ${route.url} ${label}: ${path}`)
      )
    )
  );

const ruleNamed = (name: string) => RULES.find((rule) => rule.name === name) as TGuardRule;

// Zod 3 never filled a field marked .optional(), whatever sat inside it. A plain .default() field is
// left out because Zod 3 filled that too.
const isExplicitlyOptional = (field: any) => {
  let node = field;
  while (node?._zod) {
    const { def } = node._zod;
    if (def.type === "optional") return true;
    if (def.type !== "nullable" && def.type !== "readonly") return false;
    node = def.innerType;
  }
  return false;
};

// Every .optional() field, at any depth, that a parse fills in when the caller leaves it out. Behavioral
// on purpose: a default, a prefault, a preprocess or anything else that produces a value is caught.
const findFilledOmissions = (root: unknown) => {
  const paths = new Set<string>();
  walkSchema(root, (node, context) => {
    if (node._zod.def.type !== "object") return;
    Object.entries(node._zod.def.shape ?? {}).forEach(([key, field]: [string, any]) => {
      if (!isExplicitlyOptional(field)) return;
      const result = field.safeParse(undefined);
      if (result.success && result.data !== undefined) paths.add(context.path ? `${context.path}.${key}` : key);
    });
  });
  return [...paths];
};

const OMITTED_FIELD_EXPLANATION = [
  "These fields are marked .optional() but still receive a value when the caller leaves them out. Zod 3",
  "left them absent; Zod 4 applies a .default() or .prefault() inside .optional(). On an update that",
  "overwrites the stored value. Use partialWithoutDefaults or withoutDefault from @app/lib/zod, or remove",
  "the .optional() if the field should always get the value."
].join("\n");

const SRC_ROOT = join(__dirname, "../..");

// Tests, type declarations, and modules that run work as soon as they are imported (scripts, seeds,
// migrations). The exported schema sweep must never load these; add any new one here.
const MODULES_NOT_TO_IMPORT = [
  /\.test\.ts$/,
  /\.d\.ts$/,
  /^main\.ts$/,
  /^lib\/telemetry\/instrumentation\.ts$/,
  /^db\/(knexfile|auditlog-knexfile|run-clickhouse-migrations|rename-migrations-to-mjs)\.ts$/,
  /^db\/seed-[^/]+\.ts$/,
  /^db\/(migrations|seeds|manual-migrations)\//
];

const UNREACHABLE_DB = "postgres://schema-guard:schema-guard@127.0.0.1:1/schema-guard";

beforeAll(async () => {
  Object.entries(REQUIRED_ENV_DEFAULTS).forEach(([name, value]) => {
    if (!process.env[name]) vi.stubEnv(name, value);
  });
  await initEnvConfig({} as never, {} as never);

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  ["services", "store", "permission", "auditLogService", "redis"].forEach((key) => app.decorate(key, anyDependency));
  app.decorate("cookieSigningKey", "x".repeat(32));
  await app.register(cookie, { secret: "x".repeat(32) });
  await app.register(fastifyFormBody);
  await app.register(websocket);
  app.addHook("onRoute", (route) => {
    if (route.method !== "HEAD") routes.push(route);
  });

  await app.register(
    async (v1) => {
      await v1.register(registerV1EERoutes);
      await v1.register(registerV1Routes);
    },
    { prefix: "/api/v1" }
  );
  await app.register(
    async (v2) => {
      await v2.register(registerV2EERoutes);
      await v2.register(registerV2Routes);
    },
    { prefix: "/api/v2" }
  );
  await app.register(
    async (v3) => {
      await v3.register(registerV3EERoutes);
      await v3.register(registerV3Routes);
    },
    { prefix: "/api/v3" }
  );
  await app.register(registerV4Routes, { prefix: "/api/v4" });
  await app.ready();
  await app.close();
  vi.unstubAllEnvs();
}, 120_000);

describe("route schemas avoid Zod 4 behavior changes", () => {
  test("the route walk found the API", () => {
    expect(routes.length).toBeGreaterThan(1000);
  });

  test.each(RULES)("$name", (rule) => {
    const offenders = findOffenders(rule);
    expect(offenders, `${rule.explanation}\n\nOffending fields:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("exported schemas avoid Zod 4 behavior changes", () => {
  const exportedSchemas = new Map<unknown, string>();
  const unloadable: string[] = [];
  const visitedExports = new Set<unknown>();

  // Schemas also live inside exported config maps (ACCOUNT_TYPE_CONFIGS, provider option maps), so
  // plain objects and arrays are searched a few levels down.
  const collectSchemas = (value: any, label: string, depth: number) => {
    if (!value || typeof value !== "object" || visitedExports.has(value)) return;
    visitedExports.add(value);
    if (value._zod) {
      if (!exportedSchemas.has(value)) exportedSchemas.set(value, label);
      return;
    }
    if (depth >= 4) return;
    if (Array.isArray(value)) value.forEach((item, index) => collectSchemas(item, `${label}[${index}]`, depth + 1));
    else if (Object.getPrototypeOf(value) === Object.prototype)
      Object.entries(value).forEach(([key, item]) => collectSchemas(item, `${label}.${key}`, depth + 1));
  };

  beforeAll(async () => {
    // A script that slips past the exclude list must fail to connect rather than reach a real database.
    vi.stubEnv("DB_CONNECTION_URI", UNREACHABLE_DB);
    vi.stubEnv("AUDIT_LOGS_DB_CONNECTION_URI", UNREACHABLE_DB);
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
    vi.stubEnv("NODE_ENV", "test");

    const modules = (readdirSync(SRC_ROOT, { recursive: true }) as string[])
      .map((file) => file.split(sep).join("/"))
      .filter((file) => file.endsWith(".ts") && !MODULES_NOT_TO_IMPORT.some((pattern) => pattern.test(file)));
    for (const file of modules) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const exported = (await import(join(SRC_ROOT, file))) as Record<string, unknown>;
        Object.entries(exported).forEach(([name, value]) => collectSchemas(value, `src/${file} ${name}`, 0));
      } catch (error) {
        unloadable.push(`src/${file}: ${(error as Error).message}`);
      }
    }
    vi.unstubAllEnvs();
  }, 300_000);

  test("every module under src loads, so none of its schemas are skipped", () => {
    expect(
      unloadable,
      [
        "These modules threw while being imported, so their schemas were not checked. If a module runs",
        "work on import (a script or a seed), add it to MODULES_NOT_TO_IMPORT."
      ].join("\n")
    ).toEqual([]);
    expect(exportedSchemas.size).toBeGreaterThan(1500);
  });

  test.each(RULES.filter((rule) => !rule.parts.every((part) => part === "response")))("$name", (rule) => {
    const offenders = [...exportedSchemas].flatMap(([schema, label]) =>
      offendingPaths(rule, schema).map((fieldPath) => `${label}: ${fieldPath}`)
    );
    expect(offenders, `${rule.explanation}\n\nOffending fields:\n${offenders.join("\n")}`).toEqual([]);
  });

  test("no exported schema fills in an .optional() field the caller left out", () => {
    const offenders = [...exportedSchemas].flatMap(([schema, label]) =>
      findFilledOmissions(schema).map((fieldPath) => `${label}: ${fieldPath}`)
    );
    expect(offenders, `${OMITTED_FIELD_EXPLANATION}\n\nOffending fields:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("requests leave omitted optional fields alone", () => {
  test("no request body or querystring fills in an .optional() field the caller left out", () => {
    const offenders = routes.flatMap((route) =>
      (["body", "querystring"] as const).flatMap((part) =>
        findFilledOmissions((route.schema as Record<string, unknown> | undefined)?.[part]).map(
          (fieldPath) => `${String(route.method)} ${route.url} ${part}: ${fieldPath}`
        )
      )
    );

    expect(offenders, `${OMITTED_FIELD_EXPLANATION}\n\nOffending fields:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("each guard flags the shape it exists for", () => {
  const trimSlash = (value: string) => value.replace(/\/+$/, "") || "/";

  test.each([
    {
      rule: "responses never reach a one-way transform",
      offending: z.object({ items: z.object({ name: z.string().transform((name) => name.trim()) }).array() }),
      fixed: z.object({ items: z.object({ name: bidirectionalTransform(z.string(), (name) => name.trim()) }).array() }),
      path: "items[].name"
    },
    {
      rule: "responses never reach a one-way transform",
      offending: z.object({ tags: z.preprocess((value) => value, z.string().array()) }),
      fixed: z.object({ tags: z.string().array() }),
      path: "tags"
    },
    {
      rule: "requests never apply a default to an omitted optional field",
      offending: z.object({ ttl: z.number().default(60).optional() }),
      fixed: z.object({ ttl: z.number().optional() }),
      path: "ttl"
    },
    {
      rule: "records keyed by an enum do not require every key",
      offending: z.object({ overrides: z.record(z.enum(["A", "B"]), z.string()) }),
      fixed: z.object({ overrides: z.partialRecord(z.enum(["A", "B"]), z.string()) }),
      path: "overrides"
    },
    {
      rule: "IDs are validated with .guid(), not .uuid()",
      offending: z.object({ ids: z.string().uuid().array() }),
      fixed: z.object({ ids: z.string().guid().array() }),
      path: "ids[]"
    },
    {
      rule: "request defaults that need the schema's transform use .prefault()",
      offending: z.object({ path: z.string().transform(trimSlash).default("/a/") }),
      fixed: z.object({ path: z.string().transform(trimSlash).prefault("/a/") }),
      path: "path"
    }
  ])("$rule: $path", ({ rule, offending, fixed, path }) => {
    expect(offendingPaths(ruleNamed(rule), offending)).toEqual([path]);
    expect(offendingPaths(ruleNamed(rule), fixed)).toEqual([]);
  });

  test("the omitted-field check catches any way of filling an .optional() field, at any depth", () => {
    const body = z.object({
      name: z.string().optional(),
      ttl: z.number().default(60).optional(),
      mode: z.string().prefault("strict").optional(),
      label: z
        .preprocess((value) => value ?? "none", z.string())
        .nullable()
        .optional(),
      settings: z.object({ retries: z.number().default(3).optional(), note: z.string().optional() }).optional(),
      rules: z
        .object({ level: z.string().default("low") })
        .partial()
        .array()
        .optional()
    });
    // label stays absent: .optional() skips a preprocess when the value is missing, as Zod 3 did.
    expect(findFilledOmissions(body).sort()).toEqual(["mode", "rules[].level", "settings.retries", "ttl"]);
  });

  test("a plain .default() field is not flagged, because Zod 3 filled it too", () => {
    const body = z.object({ allowedSelfApprovals: z.boolean().default(true), level: z.string().prefault("low") });
    expect(findFilledOmissions(body)).toEqual([]);
    expect(findFilledOmissions(partialWithoutDefaults(body))).toEqual([]);
  });

  test("a default whose value the transform leaves alone is not flagged", () => {
    const schema = z.object({ path: z.string().transform(trimSlash).default("/") });
    expect(
      offendingPaths(ruleNamed("request defaults that need the schema's transform use .prefault()"), schema)
    ).toEqual([]);
  });
});
