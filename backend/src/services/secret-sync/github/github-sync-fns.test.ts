/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError } from "axios";
import sodium from "libsodium-wrappers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock, paginatedMock, appTokenMock, decryptMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  paginatedMock: vi.fn(),
  appTokenMock: vi.fn(),
  decryptMock: vi.fn()
}));

vi.mock("@app/services/app-connection/github", () => ({
  GitHubConnectionMethod: { OAuth: "oauth", App: "github-app", Pat: "pat" },
  getGitHubAppAuthToken: (...args: unknown[]) => (appTokenMock as any)(...args),
  getGitHubGatewayConnectionDetails: vi.fn(),
  getGitHubInstanceApiUrl: async (connection: any) =>
    connection.credentials.instanceType === "server" ? `${connection.credentials.host}/api/v3` : "api.github.com",
  makePaginatedGitHubRequest: (...args: unknown[]) => (paginatedMock as any)(...args),
  requestWithGitHubGateway: (...args: unknown[]) => (requestMock as any)(...args)
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnectionCredentials: (...args: unknown[]) => (decryptMock as any)(...args)
}));
// The real module loads every sync provider; a prefix match is all these tests rely on.
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: (key: string, _environment: string, schema?: string) =>
    !schema || key.startsWith(schema.replace("{{secretKey}}", ""))
}));
vi.mock("@app/services/secret-sync/secret-sync-maps", () => ({ SECRET_SYNC_NAME_MAP: { github: "GitHub" } }));

/* eslint-disable import/first */
import { BadRequestError } from "@app/lib/errors";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";

import { GitHubSyncScope, GitHubSyncSecretType, GitHubSyncVisibility } from "./github-sync-enums";
import { getGitHubSecretsBasePath, gitHubPreSaveTransformDestinationConfig, GithubSyncFns } from "./github-sync-fns";
/* eslint-enable import/first */

const repoConfig = (secretType?: GitHubSyncSecretType) =>
  ({ scope: GitHubSyncScope.Repository, owner: "acme", repo: "app", secretType }) as any;

const orgConfig = (secretType: GitHubSyncSecretType, extra: Record<string, unknown> = {}) =>
  ({
    scope: GitHubSyncScope.Organization,
    org: "acme",
    visibility: GitHubSyncVisibility.All,
    secretType,
    ...extra
  }) as any;

const makeSync = (
  destinationConfig: any,
  {
    syncOptions = {},
    credentials = { personalAccessToken: "token", instanceType: "cloud" }
  }: { syncOptions?: Record<string, unknown>; credentials?: Record<string, unknown> } = {}
) =>
  ({
    destination: "github",
    destinationConfig,
    syncOptions,
    environment: { slug: "dev" },
    connection: { method: "pat", credentials, gatewayId: null, gatewayPoolId: null }
  }) as any;

const makePayload = (keys: string[]) =>
  ({
    flatten: () => Object.fromEntries(keys.map((key) => [key, { value: `value-of-${key}` }]))
  }) as any;

const gatewayV2Service = {} as any;
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn(async ({ gatewayId }) => gatewayId ?? null) } as any;
const gitHubAppDeps = {} as any;

const runSync = (secretSync: any, payload: any) =>
  GithubSyncFns.syncSecrets(secretSync, payload, gatewayV2Service, gatewayPoolService, gitHubAppDeps);

const httpError = (status: number, { headers = {}, data = {} }: { headers?: any; data?: any } = {}) =>
  new AxiosError("Request failed", undefined, undefined, undefined, {
    status,
    statusText: "",
    headers,
    data,
    config: {} as any
  });

const callsWith = (method: string) =>
  requestMock.mock.calls.map(([, , config]) => config).filter((c) => c.method === method);

let keyPair: { publicKey: Uint8Array; privateKey: Uint8Array };

beforeAll(async () => {
  await sodium.ready;
  keyPair = sodium.crypto_box_keypair();
});

beforeEach(() => {
  requestMock.mockReset();
  paginatedMock.mockReset();
  decryptMock.mockReset();
  paginatedMock.mockResolvedValue([]);
  requestMock.mockImplementation(async (_gateway: unknown, _service: unknown, config: any) => {
    if (config.method === "GET" && config.url.endsWith("/public-key")) {
      return { data: { key_id: "key-1", key: sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL) } };
    }
    return { data: {} };
  });
});

describe("getGitHubSecretsBasePath", () => {
  it.each([
    [GitHubSyncSecretType.Actions, "/repos/acme/app/actions/secrets", "/orgs/acme/actions/secrets"],
    [GitHubSyncSecretType.Dependabot, "/repos/acme/app/dependabot/secrets", "/orgs/acme/dependabot/secrets"],
    [GitHubSyncSecretType.Codespaces, "/repos/acme/app/codespaces/secrets", "/orgs/acme/codespaces/secrets"]
  ])("builds the %s paths for repository and organization scope", (secretType, repoPath, orgPath) => {
    expect(getGitHubSecretsBasePath(repoConfig(secretType))).toBe(repoPath);
    expect(getGitHubSecretsBasePath(orgConfig(secretType))).toBe(orgPath);
  });

  it("treats a config saved before secretType existed as Actions", () => {
    expect(getGitHubSecretsBasePath(repoConfig(undefined))).toBe("/repos/acme/app/actions/secrets");
  });

  it("builds the environment path for Actions", () => {
    expect(
      getGitHubSecretsBasePath({
        scope: GitHubSyncScope.RepositoryEnvironment,
        owner: "acme",
        repo: "app",
        env: "prod",
        secretType: GitHubSyncSecretType.Actions
      })
    ).toBe("/repos/acme/app/environments/prod/secrets");
  });

  it.each([GitHubSyncSecretType.Dependabot, GitHubSyncSecretType.Codespaces])(
    "refuses the environment scope for %s without retrying",
    (secretType) => {
      const build = () =>
        getGitHubSecretsBasePath({
          scope: GitHubSyncScope.RepositoryEnvironment,
          owner: "acme",
          repo: "app",
          env: "prod",
          secretType
        });

      expect(build).toThrow(SecretSyncError);
      expect(build).toThrow(/cannot be synced to a repository environment/);
    }
  );

  it("encodes every path segment", () => {
    expect(
      getGitHubSecretsBasePath({
        scope: GitHubSyncScope.Repository,
        owner: "a b",
        repo: "c/d",
        secretType: GitHubSyncSecretType.Dependabot
      })
    ).toBe("/repos/a%20b/c%2Fd/dependabot/secrets");
  });
});

describe("GithubSyncFns.syncSecrets", () => {
  it("writes Dependabot secrets that decrypt to the original value, fetching the public key once", async () => {
    await runSync(makeSync(repoConfig(GitHubSyncSecretType.Dependabot)), makePayload(["DB_URL", "API_KEY"]));

    expect(paginatedMock).toHaveBeenCalledTimes(1);
    expect(paginatedMock.mock.calls[0][3]).toBe("/repos/acme/app/dependabot/secrets");

    const publicKeyCalls = callsWith("GET");
    expect(publicKeyCalls).toHaveLength(1);
    expect(publicKeyCalls[0].url).toBe("https://api.github.com/repos/acme/app/dependabot/secrets/public-key");

    const puts = callsWith("PUT");
    expect(puts.map((c) => c.url)).toEqual([
      "https://api.github.com/repos/acme/app/dependabot/secrets/DB_URL",
      "https://api.github.com/repos/acme/app/dependabot/secrets/API_KEY"
    ]);
    expect(puts[0].data).toEqual({ secret_name: "DB_URL", key_id: "key-1", encrypted_value: expect.any(String) });

    const sealed = sodium.from_base64(puts[0].data.encrypted_value, sodium.base64_variants.ORIGINAL);
    const opened = sodium.crypto_box_seal_open(sealed, keyPair.publicKey, keyPair.privateKey);
    expect(sodium.to_string(opened)).toBe("value-of-DB_URL");
  });

  it("sends the organization visibility and selected repositories for Codespaces", async () => {
    await runSync(
      makeSync(
        orgConfig(GitHubSyncSecretType.Codespaces, {
          visibility: GitHubSyncVisibility.Selected,
          selectedRepositoryIds: [11, 22]
        })
      ),
      makePayload(["TOKEN"])
    );

    const [put] = callsWith("PUT");
    expect(put.url).toBe("https://api.github.com/orgs/acme/codespaces/secrets/TOKEN");
    expect(put.data).toMatchObject({ visibility: "selected", selected_repository_ids: [11, 22] });
  });

  it("keeps syncing a config saved before secretType existed to Actions", async () => {
    await runSync(makeSync(repoConfig(undefined)), makePayload(["A"]));

    expect(callsWith("PUT")[0].url).toBe("https://api.github.com/repos/acme/app/actions/secrets/A");
  });

  it("deletes only stale secrets that match the key schema", async () => {
    paginatedMock.mockResolvedValue([{ name: "INFISICAL_A" }, { name: "INFISICAL_STALE" }, { name: "SOMEONE_ELSES" }]);

    await runSync(
      makeSync(repoConfig(GitHubSyncSecretType.Codespaces), { syncOptions: { keySchema: "INFISICAL_{{secretKey}}" } }),
      makePayload(["INFISICAL_A"])
    );

    expect(callsWith("DELETE").map((c) => c.url)).toEqual([
      "https://api.github.com/repos/acme/app/codespaces/secrets/INFISICAL_STALE"
    ]);
  });

  it("treats a stale secret already removed on GitHub as deleted and keeps pruning", async () => {
    paginatedMock.mockResolvedValue([{ name: "GONE" }, { name: "STALE" }]);
    requestMock.mockImplementation(async (_gateway: unknown, _service: unknown, config: any) => {
      if (config.method === "DELETE" && config.url.endsWith("/GONE")) throw httpError(404);
      if (config.method === "GET") {
        return { data: { key_id: "key-1", key: sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL) } };
      }
      return { data: {} };
    });

    await runSync(makeSync(repoConfig(GitHubSyncSecretType.Dependabot)), makePayload(["A"]));

    expect(callsWith("DELETE").map((c) => c.url)).toEqual([
      "https://api.github.com/repos/acme/app/dependabot/secrets/GONE",
      "https://api.github.com/repos/acme/app/dependabot/secrets/STALE"
    ]);
  });

  it("deletes nothing when secret deletion is disabled", async () => {
    paginatedMock.mockResolvedValue([{ name: "STALE" }]);

    await runSync(
      makeSync(repoConfig(GitHubSyncSecretType.Dependabot), { syncOptions: { disableSecretDeletion: true } }),
      makePayload(["A"])
    );

    expect(callsWith("DELETE")).toHaveLength(0);
  });

  it("refuses Codespaces on GitHub Enterprise Server before calling GitHub", async () => {
    const sync = makeSync(repoConfig(GitHubSyncSecretType.Codespaces), {
      credentials: { personalAccessToken: "token", instanceType: "server", host: "github.example.com" }
    });

    await expect(runSync(sync, makePayload(["A"]))).rejects.toMatchObject({
      shouldRetry: false,
      message: expect.stringContaining("not available on GitHub Enterprise Server")
    });
    expect(requestMock).not.toHaveBeenCalled();
    expect(paginatedMock).not.toHaveBeenCalled();
  });

  it("allows Dependabot on GitHub Enterprise Server", async () => {
    const sync = makeSync(repoConfig(GitHubSyncSecretType.Dependabot), {
      credentials: { personalAccessToken: "token", instanceType: "server", host: "github.example.com" }
    });

    await runSync(sync, makePayload(["A"]));

    expect(callsWith("PUT")[0].url).toBe("https://github.example.com/api/v3/repos/acme/app/dependabot/secrets/A");
  });

  it.each([
    [orgConfig(GitHubSyncSecretType.Codespaces), 101, "more than 100 Codespaces secrets at the organization level"],
    [repoConfig(GitHubSyncSecretType.Dependabot), 101, "more than 100 Dependabot secrets at the repository level"],
    [orgConfig(GitHubSyncSecretType.Actions), 1001, "more than 1,000 Actions secrets at the organization level"]
  ])("enforces the per-type secret limit (%#)", async (config, count, message) => {
    const keys = Array.from({ length: count }, (_, i) => `KEY_${i}`);

    await expect(runSync(makeSync(config), makePayload(keys))).rejects.toMatchObject({
      shouldRetry: false,
      message: expect.stringContaining(message)
    });
  });

  it("allows 1,000 Dependabot secrets at the organization level", async () => {
    const keys = Array.from({ length: 1000 }, (_, i) => `KEY_${i}`);

    await runSync(makeSync(orgConfig(GitHubSyncSecretType.Dependabot)), makePayload(keys));

    expect(callsWith("PUT")).toHaveLength(1000);
  });

  it.each(["BAD NAME", "BAD-NAME", "1LEADING", "GITHUB_TOKEN"])(
    "refuses %s before calling GitHub and names that secret",
    async (key) => {
      const error = await runSync(
        makeSync(repoConfig(GitHubSyncSecretType.Dependabot)),
        makePayload([key, "VALID_NAME"])
      ).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(SecretSyncError);
      expect(error).toMatchObject({
        shouldRetry: false,
        secretKey: key,
        message: `GitHub does not accept secret names unless they contain only letters, digits, and underscores, and start with a letter or an underscore. Spaces are not allowed. Names cannot start with GITHUB_, regardless of case. Rename the secrets that failed this check: "${key}".`
      });
      expect((error as SecretSyncError).message).not.toContain("VALID_NAME");
      expect(requestMock).not.toHaveBeenCalled();
      expect(paginatedMock).not.toHaveBeenCalled();
    }
  );

  it("names every secret GitHub would reject", async () => {
    const error = await runSync(
      makeSync(repoConfig(GitHubSyncSecretType.Dependabot)),
      makePayload(["BAD NAME", "1LEADING", "VALID_NAME"])
    ).catch((err: unknown) => err);

    expect(error).toMatchObject({
      shouldRetry: false,
      secretKey: "BAD NAME",
      message: expect.stringContaining('Rename the secrets that failed this check: "BAD NAME", "1LEADING".')
    });
    expect((error as SecretSyncError).message).not.toContain("VALID_NAME");
    expect(requestMock).not.toHaveBeenCalled();
    expect(paginatedMock).not.toHaveBeenCalled();
  });

  it("refuses a secret that starts with github_ regardless of case", async () => {
    const error = await runSync(
      makeSync(repoConfig(GitHubSyncSecretType.Dependabot)),
      makePayload(["github_token", "VALID_NAME"])
    ).catch((err: unknown) => err);

    expect(error).toMatchObject({
      shouldRetry: false,
      secretKey: "GITHUB_TOKEN",
      message: expect.stringContaining('"GITHUB_TOKEN"')
    });
    expect(requestMock).not.toHaveBeenCalled();
    expect(paginatedMock).not.toHaveBeenCalled();
  });

  it("syncs a secret that contains GITHUB_ but does not start with it", async () => {
    await runSync(makeSync(repoConfig(GitHubSyncSecretType.Dependabot)), makePayload(["MY_GITHUB_TOKEN"]));

    expect(callsWith("PUT")[0].url).toBe("https://api.github.com/repos/acme/app/dependabot/secrets/MY_GITHUB_TOKEN");
  });

  it("syncs a secret name that starts with an underscore", async () => {
    await runSync(makeSync(repoConfig(GitHubSyncSecretType.Dependabot)), makePayload(["_TOKEN"]));

    expect(callsWith("PUT")[0].url).toBe("https://api.github.com/repos/acme/app/dependabot/secrets/_TOKEN");
  });
});

describe("GitHub permission errors", () => {
  it("returns GitHub's 403 message for a token connection and stops retrying", async () => {
    requestMock.mockRejectedValueOnce(httpError(403, { data: { message: "Resource not accessible by integration" } }));

    const error = await runSync(makeSync(repoConfig(GitHubSyncSecretType.Dependabot)), makePayload(["A"])).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect(error).toMatchObject({
      shouldRetry: false,
      message:
        "Resource not accessible by integration. Grant read and write access to the 'Dependabot secrets' permission."
    });
    expect((error as SecretSyncError).message).not.toContain("GitHub App installation");
  });

  it("uses a fallback when GitHub's 403 has no message", async () => {
    paginatedMock.mockRejectedValueOnce(httpError(403));

    await expect(
      runSync(makeSync(orgConfig(GitHubSyncSecretType.Codespaces)), makePayload(["A"]))
    ).rejects.toMatchObject({
      shouldRetry: false,
      message:
        "GitHub refused this request. Grant read and write access to the 'Organization codespaces secrets' permission."
    });
  });

  it("names GitHub's Secrets permission for an Actions sync", async () => {
    paginatedMock.mockRejectedValueOnce(
      httpError(403, { data: { message: "Resource not accessible by integration" } })
    );

    const error = await runSync(makeSync(repoConfig(GitHubSyncSecretType.Actions)), makePayload(["A"])).catch(
      (err: unknown) => err
    );

    expect((error as SecretSyncError).message).toContain("the 'Secrets' permission");
    expect((error as SecretSyncError).message).not.toContain("Actions secrets");
  });

  it("names the Secrets and Environments permissions for an environment sync", async () => {
    paginatedMock.mockRejectedValueOnce(
      httpError(403, { data: { message: "Resource not accessible by integration" } })
    );
    const environmentConfig = {
      scope: GitHubSyncScope.RepositoryEnvironment,
      owner: "acme",
      repo: "app",
      env: "prod",
      secretType: GitHubSyncSecretType.Actions
    };

    await expect(runSync(makeSync(environmentConfig), makePayload(["A"]))).rejects.toMatchObject({
      shouldRetry: false,
      message: expect.stringContaining("the 'Secrets' and 'Environments' permissions")
    });
  });

  it.each([
    [
      "github.com",
      undefined,
      "https://github.com/settings/installations/172172533 (personal) or https://github.com/organizations/acme/settings/installations/172172533 (organization)"
    ],
    [
      "GitHub Enterprise Server",
      "github.example.com",
      "https://github.example.com/settings/installations/172172533 (personal) or https://github.example.com/organizations/acme/settings/installations/172172533 (organization)"
    ]
  ])("links both GitHub App installation pages on %s", async (_label, host, installationLinks) => {
    appTokenMock.mockResolvedValue("app-token");
    paginatedMock.mockRejectedValueOnce(
      httpError(403, { data: { message: "Resource not accessible by integration" } })
    );
    const sync = {
      ...makeSync(repoConfig(GitHubSyncSecretType.Codespaces)),
      connection: { method: "github-app", credentials: { installationId: "172172533", host } }
    };

    await expect(runSync(sync, makePayload(["A"]))).rejects.toMatchObject({
      shouldRetry: false,
      message: `Resource not accessible by integration. Grant read and write access to the 'Codespaces secrets' permission. GitHub App installation: ${installationLinks}`
    });
  });

  it("uses the organization name in the organization installation link", async () => {
    appTokenMock.mockResolvedValue("app-token");
    paginatedMock.mockRejectedValueOnce(
      httpError(403, { data: { message: "Resource not accessible by integration" } })
    );
    const sync = {
      ...makeSync(orgConfig(GitHubSyncSecretType.Codespaces, { org: "widgets" })),
      connection: { method: "github-app", credentials: { installationId: "172172533" } }
    };

    await expect(runSync(sync, makePayload(["A"]))).rejects.toMatchObject({
      shouldRetry: false,
      message:
        "Resource not accessible by integration. Grant read and write access to the 'Organization codespaces secrets' permission. GitHub App installation: https://github.com/settings/installations/172172533 (personal) or https://github.com/organizations/widgets/settings/installations/172172533 (organization)"
    });
  });

  it("reports a 404 as a missing target or permission", async () => {
    paginatedMock.mockRejectedValueOnce(httpError(404));

    await expect(
      runSync(makeSync(repoConfig(GitHubSyncSecretType.Codespaces)), makePayload(["A"]))
    ).rejects.toMatchObject({
      shouldRetry: false,
      message: expect.stringContaining(
        "GitHub could not find the Codespaces secrets for repository 'acme/app'. Check that the repository exists"
      )
    });
  });

  it("returns GitHub's message when a write is refused, rather than blaming the secret", async () => {
    requestMock.mockImplementation(async (_gateway: unknown, _service: unknown, config: any) => {
      if (config.method === "PUT")
        throw httpError(403, { data: { message: "Resource not accessible by integration" } });
      return { data: { key_id: "key-1", key: sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL) } };
    });

    await expect(
      runSync(makeSync(repoConfig(GitHubSyncSecretType.Codespaces)), makePayload(["A"]))
    ).rejects.toMatchObject({
      shouldRetry: false,
      secretKey: undefined,
      message:
        "Resource not accessible by integration. Grant read and write access to the 'Codespaces secrets' permission."
    });
  });

  it("keeps reporting other write failures against the secret, and retries them", async () => {
    requestMock.mockImplementation(async (_gateway: unknown, _service: unknown, config: any) => {
      if (config.method === "PUT") throw httpError(500);
      return { data: { key_id: "key-1", key: sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL) } };
    });

    await expect(
      runSync(makeSync(repoConfig(GitHubSyncSecretType.Dependabot)), makePayload(["A"]))
    ).rejects.toMatchObject({ shouldRetry: true, secretKey: "A" });
  });

  it.each([
    ["an exhausted rate limit", { headers: { "x-ratelimit-remaining": "0" } }],
    ["a secondary rate limit", { headers: { "retry-after": "60" } }],
    ["a rate limit message", { data: { message: "You have exceeded a secondary rate limit" } }]
  ])("leaves %s as a retryable error", async (_label, response) => {
    const rateLimited = httpError(403, response);
    paginatedMock.mockRejectedValueOnce(rateLimited);

    await expect(runSync(makeSync(repoConfig(GitHubSyncSecretType.Dependabot)), makePayload(["A"]))).rejects.toBe(
      rateLimited
    );
  });
});

describe("GithubSyncFns.removeSecrets", () => {
  it("deletes only the synced secrets from the Dependabot endpoints", async () => {
    paginatedMock.mockResolvedValue([{ name: "A" }, { name: "B" }, { name: "OTHER" }]);

    await GithubSyncFns.removeSecrets(
      makeSync(orgConfig(GitHubSyncSecretType.Dependabot)),
      makePayload(["A", "B"]),
      gatewayV2Service,
      gatewayPoolService,
      gitHubAppDeps
    );

    expect(paginatedMock.mock.calls[0][3]).toBe("/orgs/acme/dependabot/secrets");
    expect(callsWith("DELETE").map((c) => c.url)).toEqual([
      "https://api.github.com/orgs/acme/dependabot/secrets/A",
      "https://api.github.com/orgs/acme/dependabot/secrets/B"
    ]);
  });

  it("keeps removing when a secret is already gone on GitHub", async () => {
    paginatedMock.mockResolvedValue([{ name: "A" }, { name: "B" }]);
    requestMock.mockImplementation(async (_gateway: unknown, _service: unknown, config: any) => {
      if (config.url.endsWith("/A")) throw httpError(404);
      return { data: {} };
    });

    await GithubSyncFns.removeSecrets(
      makeSync(repoConfig(GitHubSyncSecretType.Codespaces)),
      makePayload(["A", "B"]),
      gatewayV2Service,
      gatewayPoolService,
      gitHubAppDeps
    );

    expect(callsWith("DELETE").map((c) => c.url)).toEqual([
      "https://api.github.com/repos/acme/app/codespaces/secrets/A",
      "https://api.github.com/repos/acme/app/codespaces/secrets/B"
    ]);
  });
});

describe("gitHubPreSaveTransformDestinationConfig", () => {
  const appConnectionDAL = {
    findById: vi.fn(async () => ({ orgId: "org", projectId: null, encryptedCredentials: Buffer.from("") }))
  } as any;
  const deps = { appConnectionDAL, kmsService: {} as any, secretV2BridgeDAL: {} as any };

  it("leaves non-Codespaces configs alone without reading the connection", async () => {
    const destinationConfig = repoConfig(GitHubSyncSecretType.Dependabot);

    await expect(
      gitHubPreSaveTransformDestinationConfig({ destinationConfig, connectionId: "conn" }, deps)
    ).resolves.toBe(destinationConfig);
    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("rejects Codespaces for a GitHub Enterprise Server connection", async () => {
    decryptMock.mockResolvedValue({ personalAccessToken: "token", instanceType: "server", host: "github.example.com" });

    await expect(
      gitHubPreSaveTransformDestinationConfig(
        { destinationConfig: repoConfig(GitHubSyncSecretType.Codespaces), connectionId: "conn" },
        deps
      )
    ).rejects.toThrow(BadRequestError);
  });

  it("allows Codespaces for a GitHub.com connection", async () => {
    decryptMock.mockResolvedValue({ personalAccessToken: "token", instanceType: "cloud" });
    const destinationConfig = orgConfig(GitHubSyncSecretType.Codespaces);

    await expect(
      gitHubPreSaveTransformDestinationConfig({ destinationConfig, connectionId: "conn" }, deps)
    ).resolves.toBe(destinationConfig);
  });

  it("checks the stored config when an update only changes the connection", async () => {
    decryptMock.mockResolvedValue({ personalAccessToken: "token", instanceType: "server", host: "github.example.com" });

    await expect(
      gitHubPreSaveTransformDestinationConfig(
        {
          destinationConfig: undefined,
          existingDestinationConfig: repoConfig(GitHubSyncSecretType.Codespaces),
          connectionId: "conn"
        },
        deps
      )
    ).rejects.toThrow(/not available on GitHub Enterprise Server/);
  });
});
