import Fastify, { FastifyInstance } from "fastify";
import { vi } from "vitest";

import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@app/server/plugins/fastify-zod";

import { registerSecretSharingRouter } from "./secret-sharing-router";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ DISABLE_PUBLIC_SECRET_SHARING: false })
}));

const URL = "/api/v1/shared-secrets";
const SHARE_ID = "q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c";
const OTHER_SHARE_ID = "m1n2b3v4c5x6z7l8k9j0h1g2f3d4s5a6p7o8i9u0y1t";

const buildServer = async (shareId = SHARE_ID) => {
  const sendPostHogEvents = vi.fn().mockResolvedValue(undefined);
  const share = {
    id: shareId,
    orgId: null,
    accessType: "anyone",
    type: "share",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("services", {
    secretSharing: {
      createPublicSharedSecret: vi.fn().mockResolvedValue(share),
      accessSharedSecret: vi.fn().mockResolvedValue({ ...share, secretValue: "value" })
    },
    telemetry: { sendPostHogEvents }
  } as never);

  await app.register(registerSecretSharingRouter as never, { prefix: URL });
  await app.ready();

  return { app, sendPostHogEvents };
};

describe("secret sharing routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test("a new public share's id is not sent to analytics", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({
      method: "POST",
      url: `${URL}/public`,
      body: { secretValue: "value", expiresIn: "1h" }
    });

    expect(res.statusCode).toBe(200);
    expect(server.sendPostHogEvents).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(server.sendPostHogEvents.mock.calls)).not.toContain(SHARE_ID);
  });

  test("a viewed share's id is not sent to analytics", async () => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject({ method: "POST", url: `${URL}/${SHARE_ID}/access`, body: {} });

    expect(res.statusCode).toBe(200);
    expect(server.sendPostHogEvents).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(server.sendPostHogEvents.mock.calls)).not.toContain(SHARE_ID);
  });

  test("a share's create and view events carry the same analytics id, unique to that share", async () => {
    const distinctIdsFor = async (shareId: string) => {
      const server = await buildServer(shareId);
      app = server.app;
      await app.inject({ method: "POST", url: `${URL}/public`, body: { secretValue: "value", expiresIn: "1h" } });
      await app.inject({ method: "POST", url: `${URL}/${shareId}/access`, body: {} });
      await app.close();
      app = undefined;

      expect(server.sendPostHogEvents).toHaveBeenCalledTimes(2);
      return server.sendPostHogEvents.mock.calls.map(([event]) => (event as { distinctId: string }).distinctId);
    };

    const [created, viewed] = await distinctIdsFor(SHARE_ID);
    const [otherCreated] = await distinctIdsFor(OTHER_SHARE_ID);

    expect(viewed).toBe(created);
    expect(otherCreated).not.toBe(created);
  });
});
