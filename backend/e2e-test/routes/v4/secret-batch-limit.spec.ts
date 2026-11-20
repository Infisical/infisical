import {
  getBatchSecretLimitMessage,
  getMaxSecretsPerBatchRequest
} from "@app/services/secret-v2-bridge/secret-v2-bridge-types";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";

describe("Secret batch size limit", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secret-batch-limit"));
  });

  afterAll(async () => {
    await cleanup();
  });

  const secrets = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ secretKey: `BATCH_LIMIT_${i}`, secretValue: "value" }));

  const sendBatch = (method: "POST" | "PATCH", count: number) =>
    testServer.inject({
      method,
      url: "/api/v4/secrets/batch",
      headers: { authorization: `Bearer ${authToken}` },
      body: {
        projectId,
        environment: "dev",
        secretPath: "/",
        ...(method === "PATCH" ? { mode: "upsert" } : {}),
        secrets: secrets(count)
      }
    });

  test.each(["POST", "PATCH"] as const)("%s refuses more than the limit", async (method) => {
    const res = await sendBatch(method, getMaxSecretsPerBatchRequest() + 1);
    expect(res.statusCode).toBe(422);
    expect(res.payload).toContain(getBatchSecretLimitMessage());
  });

  test("POST accepts exactly the limit", async () => {
    const res = await sendBatch("POST", getMaxSecretsPerBatchRequest());
    expect(res.statusCode).toBe(200);
  });

  test("PIT commit refuses more creates than the limit", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/pit/batch/commit",
      headers: { authorization: `Bearer ${authToken}` },
      body: {
        projectId,
        environment: "dev",
        secretPath: "/",
        changes: { secrets: { create: secrets(getMaxSecretsPerBatchRequest() + 1) }, folders: {} }
      }
    });
    expect(res.statusCode).toBe(422);
    expect(res.payload).toContain(getBatchSecretLimitMessage());
  });
});
