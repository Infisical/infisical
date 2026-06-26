/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { request } from "@app/lib/config/request";
import { applyJitter, delay } from "@app/lib/delay";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { QoverySyncScope, QoveryVariableType } from "./qovery-sync-enums";
import { getQoveryResourceUrl, QoverySyncFns, resolveQoverySyncTarget } from "./qovery-sync-fns";
import { TQoveryApiVariable, TQoverySyncWithCredentials } from "./qovery-sync-types";

// Mock the HTTP client so no real Qovery call is made; the test only verifies the settings the user
// chose map to the correct endpoint, method, payload, and auth header.
vi.mock("@app/lib/config/request", () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

// Make the 429 retry's sleep instant; stub applyJitter to the identity so the awaited delay is deterministic.
vi.mock("@app/lib/delay", () => ({
  delay: vi.fn().mockResolvedValue(undefined),
  applyJitter: vi.fn((ms: number) => ms)
}));

// Keep the real connection module so the real paginatedQoveryRequest pagination + 429 retry runs, but
// stub getQoveryInstanceUrl to skip the SSRF/DNS check the real helper performs.
vi.mock("@app/services/app-connection/qovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/services/app-connection/qovery")>();

  return {
    ...actual,
    getQoveryInstanceUrl: vi.fn(
      async (connection: { credentials: { instanceUrl?: string } }) =>
        connection.credentials.instanceUrl ?? "https://api.qovery.com"
    )
  };
});

// keySchema filtering is exercised elsewhere; here every key is considered a match.
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: () => true
}));

const ACCESS_TOKEN = "test-token";

const listResponse = (results: TQoveryApiVariable[]) => ({ data: { results } }) as unknown as AxiosResponse;

const pagedListResponse = (results: TQoveryApiVariable[], pagination: { page: number; total_pages: number }) =>
  ({ data: { results, pagination: { ...pagination, page_size: 100, total_count: 0 } } }) as unknown as AxiosResponse;

const tooManyRequests = () =>
  new AxiosError("Too Many Requests", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 429,
    headers: {}
  } as unknown as AxiosResponse);

const expectedAuth = expect.objectContaining({
  headers: expect.objectContaining({ Authorization: `Token ${ACCESS_TOKEN}`, Accept: "application/json" })
});

const buildSecretSync = (overrides: {
  variableType: QoveryVariableType;
  environmentId?: string;
  disableSecretDeletion?: boolean;
  instanceUrl?: string;
}): TQoverySyncWithCredentials =>
  ({
    destination: SecretSync.Qovery,
    environment: { slug: "dev" },
    syncOptions: {
      disableSecretDeletion: overrides.disableSecretDeletion ?? false
    },
    destinationConfig: {
      organizationId: "org-1",
      projectId: "proj-1",
      environmentId: overrides.environmentId,
      variableType: overrides.variableType
    },
    connection: {
      credentials: {
        accessToken: ACCESS_TOKEN,
        instanceUrl: overrides.instanceUrl
      }
    }
  }) as unknown as TQoverySyncWithCredentials;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(request.get).mockResolvedValue(listResponse([]));
  vi.mocked(request.post).mockResolvedValue({ data: {} } as AxiosResponse);
  vi.mocked(request.put).mockResolvedValue({ data: {} } as AxiosResponse);
  vi.mocked(request.delete).mockResolvedValue({ data: {} } as AxiosResponse);
});

describe("getQoveryResourceUrl", () => {
  const instanceUrl = "https://api.qovery.com";

  test("secret + project scope", () => {
    expect(
      getQoveryResourceUrl({
        instanceUrl,
        scope: QoverySyncScope.Project,
        scopeId: "proj-1",
        variableType: QoveryVariableType.Secret
      })
    ).toBe("https://api.qovery.com/project/proj-1/secret");
  });

  test("variable + project scope", () => {
    expect(
      getQoveryResourceUrl({
        instanceUrl,
        scope: QoverySyncScope.Project,
        scopeId: "proj-1",
        variableType: QoveryVariableType.Variable
      })
    ).toBe("https://api.qovery.com/project/proj-1/environmentVariable");
  });

  test("variable + environment scope", () => {
    expect(
      getQoveryResourceUrl({
        instanceUrl,
        scope: QoverySyncScope.Environment,
        scopeId: "env-1",
        variableType: QoveryVariableType.Variable
      })
    ).toBe("https://api.qovery.com/environment/env-1/environmentVariable");
  });

  test("secret + environment scope", () => {
    expect(
      getQoveryResourceUrl({
        instanceUrl,
        scope: QoverySyncScope.Environment,
        scopeId: "env-1",
        variableType: QoveryVariableType.Secret
      })
    ).toBe("https://api.qovery.com/environment/env-1/secret");
  });

  test("appends the resource id when provided", () => {
    expect(
      getQoveryResourceUrl({
        instanceUrl,
        scope: QoverySyncScope.Project,
        scopeId: "proj-1",
        variableType: QoveryVariableType.Secret,
        resourceId: "sec-1"
      })
    ).toBe("https://api.qovery.com/project/proj-1/secret/sec-1");
  });

  test("normalizes a trailing slash on the instance URL", () => {
    expect(
      getQoveryResourceUrl({
        instanceUrl: "https://qovery.self-hosted.io/",
        scope: QoverySyncScope.Project,
        scopeId: "proj-1",
        variableType: QoveryVariableType.Secret
      })
    ).toBe("https://qovery.self-hosted.io/project/proj-1/secret");
  });
});

describe("resolveQoverySyncTarget", () => {
  test("derives project scope when no environment is selected", () => {
    expect(
      resolveQoverySyncTarget({
        organizationId: "org-1",
        projectId: "proj-1",
        variableType: QoveryVariableType.Secret
      } as TQoverySyncWithCredentials["destinationConfig"])
    ).toEqual({ scope: QoverySyncScope.Project, scopeId: "proj-1", variableType: QoveryVariableType.Secret });
  });

  test("derives environment scope when an environment is selected", () => {
    expect(
      resolveQoverySyncTarget({
        organizationId: "org-1",
        projectId: "proj-1",
        environmentId: "env-1",
        variableType: QoveryVariableType.Variable
      } as TQoverySyncWithCredentials["destinationConfig"])
    ).toEqual({ scope: QoverySyncScope.Environment, scopeId: "env-1", variableType: QoveryVariableType.Variable });
  });
});

describe("QoverySyncFns.syncSecrets endpoint selection", () => {
  const scenarios = [
    {
      name: "Scenario 1: environment secret + project scope",
      variableType: QoveryVariableType.Secret,
      environmentId: undefined,
      url: "https://api.qovery.com/project/proj-1/secret"
    },
    {
      name: "Scenario 2: environment variable + project scope",
      variableType: QoveryVariableType.Variable,
      environmentId: undefined,
      url: "https://api.qovery.com/project/proj-1/environmentVariable"
    },
    {
      name: "Scenario 3: environment variable + environment scope",
      variableType: QoveryVariableType.Variable,
      environmentId: "env-1",
      url: "https://api.qovery.com/environment/env-1/environmentVariable"
    },
    {
      name: "Scenario 4: environment secret + environment scope",
      variableType: QoveryVariableType.Secret,
      environmentId: "env-1",
      url: "https://api.qovery.com/environment/env-1/secret"
    }
  ];

  scenarios.forEach((scenario) => {
    test(`${scenario.name} lists and creates against the correct endpoint`, async () => {
      const secretSync = buildSecretSync({
        variableType: scenario.variableType,
        environmentId: scenario.environmentId
      });

      await QoverySyncFns.syncSecrets(secretSync, { FOO: { value: "bar" } });

      expect(request.get).toHaveBeenCalledWith(scenario.url, expectedAuth);
      expect(request.post).toHaveBeenCalledWith(scenario.url, { key: "FOO", value: "bar" }, expectedAuth);
    });
  });

  test("uses a custom self-hosted instance URL", async () => {
    const secretSync = buildSecretSync({
      variableType: QoveryVariableType.Secret,
      instanceUrl: "https://qovery.self-hosted.io"
    });

    await QoverySyncFns.syncSecrets(secretSync, { FOO: { value: "bar" } });

    expect(request.post).toHaveBeenCalledWith(
      "https://qovery.self-hosted.io/project/proj-1/secret",
      { key: "FOO", value: "bar" },
      expectedAuth
    );
  });
});

describe("QoverySyncFns.syncSecrets reconciliation", () => {
  test("updates a changed environment variable via PUT (and does not create)", async () => {
    vi.mocked(request.get).mockResolvedValue(
      listResponse([{ id: "v1", key: "FOO", value: "old", scope: "PROJECT", variable_type: "VALUE" }])
    );

    await QoverySyncFns.syncSecrets(buildSecretSync({ variableType: QoveryVariableType.Variable }), {
      FOO: { value: "new" }
    });

    expect(request.put).toHaveBeenCalledWith(
      "https://api.qovery.com/project/proj-1/environmentVariable/v1",
      { key: "FOO", value: "new" },
      expectedAuth
    );
    expect(request.post).not.toHaveBeenCalled();
  });

  test("skips the PUT when an environment variable value is unchanged", async () => {
    vi.mocked(request.get).mockResolvedValue(
      listResponse([{ id: "v1", key: "FOO", value: "same", scope: "PROJECT", variable_type: "VALUE" }])
    );

    await QoverySyncFns.syncSecrets(buildSecretSync({ variableType: QoveryVariableType.Variable }), {
      FOO: { value: "same" }
    });

    expect(request.put).not.toHaveBeenCalled();
  });

  test("always overwrites an existing secret since its value is never returned", async () => {
    vi.mocked(request.get).mockResolvedValue(
      listResponse([{ id: "s1", key: "FOO", scope: "PROJECT", variable_type: "VALUE" }])
    );

    await QoverySyncFns.syncSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }), {
      FOO: { value: "bar" }
    });

    expect(request.put).toHaveBeenCalledWith(
      "https://api.qovery.com/project/proj-1/secret/s1",
      { key: "FOO", value: "bar" },
      expectedAuth
    );
  });

  test("deletes managed remote entries not present in the source set", async () => {
    vi.mocked(request.get).mockResolvedValue(
      listResponse([{ id: "v1", key: "OLD", scope: "PROJECT", variable_type: "VALUE" }])
    );

    await QoverySyncFns.syncSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }), {
      FOO: { value: "bar" }
    });

    expect(request.delete).toHaveBeenCalledWith("https://api.qovery.com/project/proj-1/secret/v1", expectedAuth);
  });

  test("does not delete anything when disableSecretDeletion is set", async () => {
    vi.mocked(request.get).mockResolvedValue(
      listResponse([{ id: "v1", key: "OLD", scope: "PROJECT", variable_type: "VALUE" }])
    );

    await QoverySyncFns.syncSecrets(
      buildSecretSync({ variableType: QoveryVariableType.Secret, disableSecretDeletion: true }),
      { FOO: { value: "bar" } }
    );

    expect(request.delete).not.toHaveBeenCalled();
  });

  test("never touches built-in or inherited-scope entries", async () => {
    vi.mocked(request.get).mockResolvedValue(
      listResponse([
        { id: "b1", key: "BUILTIN", scope: "BUILT_IN", variable_type: "BUILT_IN" },
        // ENVIRONMENT-scoped entry is inherited when syncing at the project level.
        { id: "e1", key: "INHERITED", scope: "ENVIRONMENT", variable_type: "VALUE" }
      ])
    );

    await QoverySyncFns.syncSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }), {});

    expect(request.delete).not.toHaveBeenCalled();
    expect(request.put).not.toHaveBeenCalled();
  });
});

describe("QoverySyncFns.removeSecrets", () => {
  test("deletes only the managed entries present in the secret map", async () => {
    vi.mocked(request.get).mockResolvedValue(
      listResponse([
        { id: "v1", key: "FOO", scope: "PROJECT", variable_type: "VALUE" },
        { id: "v2", key: "BAR", scope: "PROJECT", variable_type: "VALUE" }
      ])
    );

    await QoverySyncFns.removeSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }), {
      FOO: { value: "x" }
    });

    expect(request.delete).toHaveBeenCalledTimes(1);
    expect(request.delete).toHaveBeenCalledWith("https://api.qovery.com/project/proj-1/secret/v1", expectedAuth);
  });
});

describe("QoverySyncFns pagination", () => {
  test("walks every page of managed variables and reconciles entries from all pages", async () => {
    vi.mocked(request.get)
      .mockResolvedValueOnce(
        pagedListResponse([{ id: "v1", key: "FOO", scope: "PROJECT", variable_type: "VALUE" }], {
          page: 1,
          total_pages: 2
        })
      )
      .mockResolvedValueOnce(
        pagedListResponse([{ id: "v2", key: "BAR", scope: "PROJECT", variable_type: "VALUE" }], {
          page: 2,
          total_pages: 2
        })
      );

    await QoverySyncFns.removeSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }), {
      FOO: { value: "x" },
      BAR: { value: "y" }
    });

    // Both pages were fetched, in order, with the page/page_size query params.
    expect(request.get).toHaveBeenCalledTimes(2);
    expect(request.get).toHaveBeenNthCalledWith(
      1,
      "https://api.qovery.com/project/proj-1/secret",
      expect.objectContaining({ params: { page: 1, page_size: 100 } })
    );
    expect(request.get).toHaveBeenNthCalledWith(
      2,
      "https://api.qovery.com/project/proj-1/secret",
      expect.objectContaining({ params: { page: 2, page_size: 100 } })
    );

    // Entries discovered across both pages are reconciled.
    expect(request.delete).toHaveBeenCalledTimes(2);
    expect(request.delete).toHaveBeenCalledWith("https://api.qovery.com/project/proj-1/secret/v1", expectedAuth);
    expect(request.delete).toHaveBeenCalledWith("https://api.qovery.com/project/proj-1/secret/v2", expectedAuth);
  });
});

describe("QoverySyncFns rate limiting", () => {
  test("sleeps with jitter and retries the listing after a 429, then succeeds", async () => {
    vi.mocked(request.get)
      .mockRejectedValueOnce(tooManyRequests())
      .mockResolvedValueOnce(listResponse([{ id: "v1", key: "FOO", scope: "PROJECT", variable_type: "VALUE" }]));

    await QoverySyncFns.removeSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }), {
      FOO: { value: "x" }
    });

    // First GET was rate-limited; after one jittered sleep the retry succeeded and the entry was reconciled.
    expect(request.get).toHaveBeenCalledTimes(2);
    expect(applyJitter).toHaveBeenCalledWith(2000);
    expect(delay).toHaveBeenCalledTimes(1);
    expect(request.delete).toHaveBeenCalledWith("https://api.qovery.com/project/proj-1/secret/v1", expectedAuth);
  });

  test("surfaces the error after exhausting retries", async () => {
    vi.mocked(request.get).mockRejectedValue(tooManyRequests());

    await expect(
      QoverySyncFns.removeSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }), { FOO: { value: "x" } })
    ).rejects.toBeInstanceOf(AxiosError);

    // 1 initial attempt + 5 retries.
    expect(request.get).toHaveBeenCalledTimes(6);
  });
});

describe("QoverySyncFns.getSecrets", () => {
  test("throws because Qovery does not support importing secrets", async () => {
    await expect(
      QoverySyncFns.getSecrets(buildSecretSync({ variableType: QoveryVariableType.Secret }))
    ).rejects.toThrow(/does not support importing secrets/i);
  });
});
