import fastify from "fastify";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { fastifyErrHandler } from "@app/server/plugins/error-handler";

import { assertJwtNotExpired } from "./identity-access-token-fns";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ MAX_MACHINE_IDENTITY_TOKEN_AGE: 7_776_000 }),
  getOriginalConfig: () => ({})
}));

const NOW = 1_700_000_000;

// The expiry recheck runs after jwt.verify has already passed, so its refusal has to look exactly like
// the one jwt.verify gives an expired token. Clients branch on the status code to decide whether to
// re-authenticate.
describe("expired-token response", () => {
  const server = fastify();

  beforeAll(async () => {
    await server.register(fastifyErrHandler);
    server.get("/recheck", async () => {
      assertJwtNotExpired({ exp: NOW, nowSeconds: NOW });
      return {};
    });
    server.get("/verify", async () => {
      const token = jwt.sign({ exp: NOW }, "secret");
      jwt.verify(token, "secret");
      return {};
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  test("the recheck answers like an expired token rejected by jwt.verify", async () => {
    const recheck = await server.inject({ method: "GET", url: "/recheck" });
    const verify = await server.inject({ method: "GET", url: "/verify" });

    expect(recheck.statusCode).toBe(403);
    expect(recheck.json()).toMatchObject({
      statusCode: 403,
      error: "TokenError",
      message: "Your token has expired. Please re-authenticate."
    });
    const { reqId: recheckReqId, ...recheckBody } = recheck.json<Record<string, unknown>>();
    const { reqId: verifyReqId, ...verifyBody } = verify.json<Record<string, unknown>>();
    expect(recheckReqId).toBeDefined();
    expect(verifyReqId).toBeDefined();
    expect(recheckBody).toEqual(verifyBody);
  });
});
