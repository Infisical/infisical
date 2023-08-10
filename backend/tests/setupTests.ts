import { Server } from "http";
import main from "../src";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { githubPushEventSecretScan } from "../src/queues/secret-scanning/githubScanPushEvent";
import { syncSecretsToThirdPartyServices } from "../src/queues/integrations/syncSecretsToThirdPartyServices";

let server: Server;

beforeAll(async () => {
  server = await main;
});

afterAll(async () => {
  server.close();
  githubPushEventSecretScan.close()
  syncSecretsToThirdPartyServices.close()
});

describe("Healthcheck endpoint", () => {
  it("GET /healthcheck should return OK", async () => {
    const res = await request(server).get("/healthcheck");
    expect(res.status).toEqual(200);
  });
});
