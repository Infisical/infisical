/* eslint-disable no-underscore-dangle, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
import cookie from "@fastify/cookie";
import fastifyFormBody from "@fastify/formbody";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@fastify/type-provider-zod";
import websocket from "@fastify/websocket";
import Fastify, { RouteOptions } from "fastify";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { registerV1EERoutes } from "@app/ee/routes/v1";
import { registerV2EERoutes } from "@app/ee/routes/v2";
import { registerV3EERoutes } from "@app/ee/routes/v3";
import { initEnvConfig } from "@app/lib/config/env";
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

const childrenOf = (def: any) => [
  def.innerType,
  def.in,
  def.out,
  def.left,
  def.right,
  def.valueType,
  ...(def.options ?? []),
  ...(def.items ?? [])
];

const findPlainTransforms = (root: unknown) => {
  const paths = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (node: any, path: string) => {
    if (!node?._zod || seen.has(node)) return;
    seen.add(node);
    const { def } = node._zod;
    if (def.type === "transform") paths.add(path || "(root)");
    Object.entries(def.shape ?? {}).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    childrenOf(def).forEach((child) => visit(child, path));
    if (def.element) visit(def.element, `${path}[]`);
    if (def.type === "lazy") visit(def.getter(), path);
  };
  visit(root, "");
  return [...paths];
};

const findDefaultsInsideOptional = (root: unknown) => {
  const paths = new Set<string>();
  const visit = (node: any, path: string, insideOptional: boolean, seen: Set<unknown>) => {
    if (!node?._zod || seen.has(node)) return;
    const next = new Set(seen).add(node);
    const { def } = node._zod;
    if (def.type === "default" && insideOptional) paths.add(path || "(root)");
    const optionalHere = insideOptional || def.type === "optional";
    Object.entries(def.shape ?? {}).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key, false, next));
    childrenOf(def).forEach((child) => visit(child, path, optionalHere, next));
    if (def.element) visit(def.element, `${path}[]`, false, next);
  };
  visit(root, "", false, new Set());
  return [...paths];
};

const routes: RouteOptions[] = [];

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

describe("route schemas", () => {
  // The serializer encodes responses with z.safeEncode, which throws on a one-way .transform() or
  // z.preprocess. Response-side transforms must be codecs (see bidirectionalTransform in @app/lib/zod).
  test("responses never reach a one-way transform", () => {
    const offenders = routes.flatMap((route) =>
      Object.entries((route.schema as { response?: Record<string, unknown> } | undefined)?.response ?? {}).flatMap(
        ([status, schema]) =>
          findPlainTransforms(schema).map((path) => `${String(route.method)} ${route.url} ${status}: ${path}`)
      )
    );
    expect(offenders).toEqual([]);
  });

  // Zod 4 applies a default wrapped in .optional() or .partial(), so an omitted field in an update body
  // would be reset to its default. Use withoutDefault or partialWithoutDefaults from @app/lib/zod.
  test("request bodies and querystrings never apply a default to an omitted optional field", () => {
    const offenders = routes.flatMap((route) =>
      (["body", "querystring"] as const).flatMap((part) =>
        findDefaultsInsideOptional((route.schema as Record<string, unknown> | undefined)?.[part]).map(
          (path) => `${String(route.method)} ${route.url} ${part}: ${path}`
        )
      )
    );
    expect(offenders).toEqual([]);
  });
});
