import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";

const CONCURRENT_REQUESTS = 8;

describe("Concurrent creates of the same secret", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secret-race"));
  });

  afterEach(async () => {
    await cleanup();
  });

  const createConcurrently = (url: string, body: Record<string, unknown>) =>
    Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        testServer.inject({ method: "POST", url, headers: { authorization: `Bearer ${authToken}` }, body })
      )
    );

  const listSecretKeys = async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v4/secrets",
      headers: { authorization: `Bearer ${authToken}` },
      query: { projectId, environment: "dev", secretPath: "/" }
    });
    expect(res.statusCode).toBe(200);
    return (res.json().secrets as { secretKey: string }[]).map((el) => el.secretKey);
  };

  test("a single create stores one secret and answers the rest with already exists", async () => {
    const responses = await createConcurrently("/api/v4/secrets/RACE_SINGLE", {
      projectId,
      environment: "dev",
      secretValue: "value"
    });

    expect(responses.map((res) => res.statusCode).sort()).toEqual([
      200,
      ...Array<number>(CONCURRENT_REQUESTS - 1).fill(400)
    ]);
    for (const res of responses.filter((el) => el.statusCode === 400)) {
      expect(res.json().message).toBe("Secret 'RACE_SINGLE' already exists in path '/' of environment 'dev'");
    }
    expect(await listSecretKeys()).toEqual(["RACE_SINGLE"]);
  });

  test("a batch create stores one secret and answers the rest with already exists", async () => {
    const responses = await createConcurrently("/api/v4/secrets/batch", {
      projectId,
      environment: "dev",
      secretPath: "/",
      secrets: [{ secretKey: "RACE_BATCH", secretValue: "value" }]
    });

    expect(responses.map((res) => res.statusCode).sort()).toEqual([
      200,
      ...Array<number>(CONCURRENT_REQUESTS - 1).fill(400)
    ]);
    expect(await listSecretKeys()).toEqual(["RACE_BATCH"]);
  });
});
