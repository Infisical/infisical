import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { keyStoreFactory } from "@app/keystore/keystore";
import { buildClickHouseFromConfig } from "@app/lib/config/clickhouse";
import { initEnvConfig } from "@app/lib/config/env";
import { buildRedisFromConfig } from "@app/lib/config/redis";
import { initLogger } from "@app/lib/logger";
import { RunMode } from "@app/lib/types";
import { queueServiceFactory } from "@app/queue";
import { main } from "@app/server/app";

import { mockSmtpServer } from "./mocks/smtp";

// One route per registration block gated by the api run mode, so dropping the gate on any single
// block fails a case here. `url` is the registered pattern (what hasRoute matches), `requestUrl` a
// concrete path to send.
const API_ROUTES = [
  { method: "GET" as const, url: "/api/v1/admin/config", requestUrl: "/api/v1/admin/config" },
  { method: "GET" as const, url: "/api/v2/users/me/organizations", requestUrl: "/api/v2/users/me/organizations" },
  { method: "GET" as const, url: "/api/v3/secrets/raw", requestUrl: "/api/v3/secrets/raw" },
  { method: "GET" as const, url: "/api/v4/secrets/", requestUrl: "/api/v4/secrets" },
  { method: "POST" as const, url: "/secret-scanning/webhooks/github", requestUrl: "/secret-scanning/webhooks/github" },
  {
    method: "GET" as const,
    url: "/.well-known/est/:identifier/cacerts",
    requestUrl: "/.well-known/est/some-template/cacerts"
  }
];

describe("INFISICAL_RUN_MODES route registration", () => {
  describe("with the api run mode (the shared test server)", () => {
    test("serves the status endpoint", async () => {
      const res = await testServer.inject({ method: "GET", url: "/api/status" });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toHaveProperty("message", "Ok");
    });

    test("serves the product API", async () => {
      const res = await testServer.inject({ method: "GET", url: "/api/v1/admin/config" });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toHaveProperty("config");
    });

    test.each(API_ROUTES)("registers $method $url", ({ method, url }) => {
      expect(testServer.hasRoute({ method, url })).toBe(true);
    });
  });

  describe("without the api run mode (a worker-only pod)", () => {
    let workerServer: Awaited<ReturnType<typeof main>>;
    const originalRunModes = process.env.INFISICAL_RUN_MODES;

    beforeAll(async () => {
      // Spec files run in a separate module graph from the shared test server, so re-initializing
      // the env config here rebinds only this file's copy — the running test server is untouched.
      initLogger();
      process.env.INFISICAL_RUN_MODES = `${RunMode.GeneralWorkers},${RunMode.SecretScanning}`;
      const envConfig = await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL);

      workerServer = await main({
        db: testDb,
        smtp: mockSmtpServer(),
        queue: queueServiceFactory(envConfig),
        keyStore: keyStoreFactory(envConfig, keyValueStoreDALFactory(testDb)),
        redis: buildRedisFromConfig(envConfig),
        clickhouse: buildClickHouseFromConfig(envConfig),
        hsmService: testHsmService,
        kmsRootConfigDAL: testKmsRootConfigDAL,
        superAdminDAL: testSuperAdminDAL,
        envConfig
      });
    });

    afterAll(async () => {
      await workerServer?.close();

      if (originalRunModes === undefined) delete process.env.INFISICAL_RUN_MODES;
      else process.env.INFISICAL_RUN_MODES = originalRunModes;
      await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL);
    });

    test("still serves the status endpoint so probes keep working", async () => {
      const res = await workerServer.inject({ method: "GET", url: "/api/status" });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toHaveProperty("message", "Ok");
    });

    test.each(API_ROUTES)("does not register $method $url", async ({ method, url, requestUrl }) => {
      expect(workerServer.hasRoute({ method, url })).toBe(false);

      // 404 rather than 401: the route is absent, not merely refusing the caller.
      const res = await workerServer.inject({ method, url: requestUrl });
      expect(res.statusCode).toBe(404);
    });
  });
});
