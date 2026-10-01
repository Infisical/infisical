/* eslint-disable no-underscore-dangle, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
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
import { bidirectionalTransform } from "@app/lib/zod";
import { registerV1Routes } from "@app/server/routes/v1";
import { registerV2Routes } from "@app/server/routes/v2";
import { registerV3Routes } from "@app/server/routes/v3";
import { registerV4Routes } from "@app/server/routes/v4";

const REQUIRED_ENV_DEFAULTS: Record<string, string> = {
  DB_CONNECTION_URI: "postgres://infisical:infisical@localhost:5432/infisical",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "route-schema-guards-test-secret",
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

  test("a default whose value the transform leaves alone is not flagged", () => {
    const schema = z.object({ path: z.string().transform(trimSlash).default("/") });
    expect(
      offendingPaths(ruleNamed("request defaults that need the schema's transform use .prefault()"), schema)
    ).toEqual([]);
  });
});
