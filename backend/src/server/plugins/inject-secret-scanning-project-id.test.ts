import Fastify, { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./fastify-zod";
import { injectSecretScanningProjectId } from "./inject-secret-scanning-project-id";

const ORG_ID = "org-1";
const ACTIVE_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OLDER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const buildServer = async ({
  activeProjectId = ACTIVE_PROJECT_ID as string | null,
  validProjectIds = [ACTIVE_PROJECT_ID, OLDER_PROJECT_ID],
  isAuthenticated = true
} = {}) => {
  const findActiveProjectId = vi.fn().mockResolvedValue(activeProjectId);
  const isSecretScanningProject = vi.fn(async (projectId: string, orgId: string) =>
    Boolean(orgId === ORG_ID && validProjectIds.includes(projectId))
  );

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((error: Error, _req, reply) => {
    let statusCode = 500;
    if (error instanceof NotFoundError) statusCode = 404;
    else if (error instanceof BadRequestError) statusCode = 400;
    return reply.status(statusCode).send({ message: error.message });
  });

  app.decorate("services", {
    secretScanningV2ProjectResolver: { findActiveProjectId, isSecretScanningProject }
  } as never);
  app.addHook("onRequest", async (req) => {
    if (isAuthenticated) Object.assign(req, { permission: { orgId: ORG_ID } });
  });
  await app.register(injectSecretScanningProjectId);

  const echo = async (req: { internalSecretScanningProjectId: string }) => ({
    projectId: req.internalSecretScanningProjectId
  });

  app.route({
    method: "GET",
    url: "/api/v2/secret-scanning/data-sources",
    schema: { querystring: z.object({ projectId: z.string().trim().min(1).optional() }) },
    handler: echo
  });
  app.route({
    method: "PATCH",
    url: "/api/v2/secret-scanning/configs",
    schema: {
      querystring: z.object({ projectId: z.string().trim().min(1).optional() }),
      body: z.object({ content: z.string().nullable() })
    },
    handler: echo
  });
  app.route({
    method: "POST",
    url: "/api/v2/secret-scanning/data-sources/github",
    schema: { body: z.object({ name: z.string(), projectId: z.string().trim().min(1).optional() }) },
    handler: echo
  });
  app.route({
    method: "GET",
    url: "/api/v2/secret-scanning/findings/:findingId",
    schema: { params: z.object({ findingId: z.string() }) },
    handler: echo
  });
  app.route({
    method: "GET",
    url: "/api/v1/other",
    schema: { querystring: z.object({ projectId: z.string().optional() }) },
    handler: echo
  });

  await app.ready();
  return { app, findActiveProjectId, isSecretScanningProject };
};

describe("injectSecretScanningProjectId", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test("resolves the active project when no projectId is passed", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({ method: "GET", url: "/api/v2/secret-scanning/data-sources" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ projectId: ACTIVE_PROJECT_ID });
    expect(server.findActiveProjectId).toHaveBeenCalledWith(ORG_ID);
    expect(server.isSecretScanningProject).not.toHaveBeenCalled();
  });

  test("uses an explicit projectId after checking it belongs to the org", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/secret-scanning/data-sources?projectId=${OLDER_PROJECT_ID}`
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ projectId: OLDER_PROJECT_ID });
    expect(server.isSecretScanningProject).toHaveBeenCalledWith(OLDER_PROJECT_ID, ORG_ID);
    expect(server.findActiveProjectId).not.toHaveBeenCalled();
  });

  test("trims an explicit projectId before using it", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/secret-scanning/data-sources?projectId=%20${OLDER_PROJECT_ID}%20`
    });

    expect(res.json()).toEqual({ projectId: OLDER_PROJECT_ID });
  });

  test("rejects a projectId that is not a Secret Scanning project in the org", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/secret-scanning/data-sources?projectId=${UNKNOWN_PROJECT_ID}`
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ message: string }>().message).toContain(UNKNOWN_PROJECT_ID);
  });

  test("fails with a clear error when the org has no project, without creating one", async () => {
    const server = await buildServer({ activeProjectId: null });
    app = server.app;

    const res = await app.inject({ method: "GET", url: "/api/v2/secret-scanning/data-sources" });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toContain("no Secret Scanning project yet");
  });

  test("reads a body-declared projectId and ignores one in the query", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/secret-scanning/data-sources/github?projectId=${ACTIVE_PROJECT_ID}`,
      payload: { name: "repo", projectId: OLDER_PROJECT_ID }
    });

    expect(res.json()).toEqual({ projectId: OLDER_PROJECT_ID });
    expect(server.isSecretScanningProject).toHaveBeenCalledTimes(1);
    expect(server.isSecretScanningProject).toHaveBeenCalledWith(OLDER_PROJECT_ID, ORG_ID);
  });

  test("falls back to the active project when a body-declared projectId is missing, even with one in the query", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/secret-scanning/data-sources/github?projectId=${OLDER_PROJECT_ID}`,
      payload: { name: "repo" }
    });

    expect(res.json()).toEqual({ projectId: ACTIVE_PROJECT_ID });
    expect(server.isSecretScanningProject).not.toHaveBeenCalled();
  });

  test("reads a query-declared projectId and ignores one in the body", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v2/secret-scanning/configs?projectId=${ACTIVE_PROJECT_ID}`,
      payload: { content: null, projectId: OLDER_PROJECT_ID }
    });

    expect(res.json()).toEqual({ projectId: ACTIVE_PROJECT_ID });
    expect(server.isSecretScanningProject).toHaveBeenCalledWith(ACTIVE_PROJECT_ID, ORG_ID);
  });

  test("skips routes that do not declare a projectId", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/secret-scanning/findings/finding-1?projectId=${OLDER_PROJECT_ID}`
    });

    expect(res.json()).toEqual({ projectId: "" });
    expect(server.findActiveProjectId).not.toHaveBeenCalled();
    expect(server.isSecretScanningProject).not.toHaveBeenCalled();
  });

  test("skips routes outside the Secret Scanning prefix", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({ method: "GET", url: `/api/v1/other?projectId=${OLDER_PROJECT_ID}` });

    expect(res.json()).toEqual({ projectId: "" });
    expect(server.findActiveProjectId).not.toHaveBeenCalled();
  });

  test("skips unauthenticated requests", async () => {
    const server = await buildServer({ isAuthenticated: false });
    app = server.app;

    const res = await app.inject({ method: "GET", url: "/api/v2/secret-scanning/data-sources" });

    expect(res.json()).toEqual({ projectId: "" });
    expect(server.findActiveProjectId).not.toHaveBeenCalled();
  });
});
