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

const buildServer = async () => {
  const sendPostHogEvents = vi.fn().mockResolvedValue(undefined);
  const share = {
    id: SHARE_ID,
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
});
