/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports, so the spies they reference must come from `vi.hoisted`.
const { getMock, postMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn()
}));

vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: vi.fn(async () => undefined),
  safeRequest: {
    get: (...args: unknown[]) => (getMock as any)(...args),
    post: (...args: unknown[]) => (postMock as any)(...args),
    delete: (...args: unknown[]) => (deleteMock as any)(...args)
  }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { CreateGitLabGroupAccessTokenRotationSchema } from "@app/ee/services/secret-rotation-v2/gitlab-group-access-token/gitlab-group-access-token-rotation-schemas";
// eslint-disable-next-line import/first
import {
  GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS,
  GitLabTokenAccessLevel,
  GitLabTokenScope
} from "@app/ee/services/secret-rotation-v2/shared/gitlab-token";
// eslint-disable-next-line import/first
import {
  GitLabAccessTokenType,
  GitLabConnectionMethod
} from "@app/services/app-connection/gitlab/gitlab-connection-enums";

// eslint-disable-next-line import/first
import { gitLabGroupAccessTokenRotationFactory } from "./gitlab-group-access-token-rotation-fns";

const GROUP_ID = "34";
const TOKENS_URL = `https://gitlab.example.com/api/v4/groups/${GROUP_ID}/access_tokens`;

const axiosError = (status: number, data: unknown) =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as any,
    data
  });

const buildConnection = (overrides: Record<string, unknown> = {}) => ({
  id: "connection-id",
  orgId: "org-id",
  projectId: null,
  method: GitLabConnectionMethod.AccessToken,
  credentials: {
    accessToken: "connection-token",
    instanceUrl: "https://gitlab.example.com",
    accessTokenType: GitLabAccessTokenType.Personal
  },
  ...overrides
});

const buildFactory = (connection: Record<string, unknown> = buildConnection()) =>
  gitLabGroupAccessTokenRotationFactory(
    {
      connection,
      rotationInterval: 30,
      parameters: {
        groupId: GROUP_ID,
        name: "ci-token",
        description: "Used by CI",
        scopes: [GitLabTokenScope.ReadApi, GitLabTokenScope.ReadRepository],
        accessLevel: GitLabTokenAccessLevel.Developer
      },
      secretsMapping: { tokenId: "GITLAB_TOKEN_ID", token: "GITLAB_TOKEN" }
    } as any,
    { updateById: vi.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

const callback = vi.fn(async (credentials?: unknown) => credentials as any);

const createInput = (parameters: Record<string, unknown>) => ({
  name: "gitlab-rotation",
  projectId: "project-id",
  connectionId: "7d5b0c56-1f0e-4f0a-9d65-7b9b8b2a3c11",
  environment: "prod",
  secretPath: "/",
  isAutoRotationEnabled: true,
  rotationInterval: 30,
  parameters: {
    groupId: GROUP_ID,
    name: "ci-token",
    scopes: [GitLabTokenScope.Api],
    ...parameters
  },
  secretsMapping: { tokenId: "GITLAB_TOKEN_ID", token: "GITLAB_TOKEN" }
});

describe("gitLabGroupAccessTokenRotationFactory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T15:30:00.000Z"));
    postMock.mockResolvedValue({ data: { id: 101, token: "glpat-new" } });
    deleteMock.mockResolvedValue({ status: 204 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("creates a group access token with the configured scopes, role, and an expiry date", async () => {
    const result = await buildFactory().issueCredentials(callback);

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, options] = postMock.mock.calls[0];
    expect(url).toBe(TOKENS_URL);
    expect(body).toEqual({
      name: `ci-token-${Date.now()}`,
      description: "Used by CI",
      scopes: ["read_api", "read_repository"],
      access_level: 30,
      expires_at: "2027-01-20"
    });
    expect(options.headers["PRIVATE-TOKEN"]).toBe("connection-token");
    expect(options["axios-retry"]).toEqual({ retries: 0 });
    expect(result).toEqual({ tokenId: "101", token: "glpat-new" });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("creates the token without looking up the connection's own user, since every token gets a new bot user", async () => {
    await buildFactory().issueCredentials(callback);

    expect(getMock).not.toHaveBeenCalled();
  });

  it("authenticates with a bearer token for OAuth connections", async () => {
    await buildFactory(
      buildConnection({
        method: GitLabConnectionMethod.OAuth,
        credentials: {
          accessToken: "oauth-token",
          refreshToken: "refresh-token",
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
          instanceUrl: "https://gitlab.example.com"
        }
      })
    ).issueCredentials(callback);

    expect(postMock.mock.calls[0][2].headers).toMatchObject({
      Authorization: "Bearer oauth-token"
    });
  });

  it.each([GitLabAccessTokenType.Group, GitLabAccessTokenType.Project])(
    "refuses a connection that uses a %s access token, before calling GitLab",
    async (accessTokenType) => {
      const connection = buildConnection({
        credentials: {
          accessToken: "token",
          instanceUrl: "https://gitlab.example.com",
          accessTokenType
        }
      });

      await expect(buildFactory(connection).issueCredentials(callback)).rejects.toThrow(
        `GitLab ${accessTokenType} access tokens cannot create other tokens`
      );
      expect(postMock).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    }
  );

  it("revokes a created token that Infisical fails to save, then reports the save error", async () => {
    const failingSave = vi.fn(async () => {
      throw new Error("secret GITLAB_TOKEN already exists");
    });

    await expect(buildFactory().issueCredentials(failingSave)).rejects.toThrow("secret GITLAB_TOKEN already exists");
    expect(deleteMock).toHaveBeenCalledWith(`${TOKENS_URL}/101`, expect.anything());
  });

  it("points at the Owner role when GitLab refuses token creation", async () => {
    postMock.mockRejectedValue(axiosError(403, { message: "403 Forbidden" }));

    await expect(buildFactory().issueCredentials(callback)).rejects.toThrow(
      "Failed to create a GitLab token for group '34': 403 Forbidden. Check that the connection's user has the Owner role on the group."
    );
  });

  it("revokes the inactive token before creating its replacement", async () => {
    const result = await buildFactory().rotateCredentials({ tokenId: "77", token: "glpat-old" }, callback, {
      tokenId: "88",
      token: "glpat-active"
    });

    expect(deleteMock).toHaveBeenCalledWith(`${TOKENS_URL}/77`, expect.anything());
    expect(deleteMock.mock.invocationCallOrder[0]).toBeLessThan(postMock.mock.invocationCallOrder[0]);
    expect(result).toEqual({ tokenId: "101", token: "glpat-new" });
  });

  it("does not create a token when the inactive one cannot be revoked", async () => {
    deleteMock.mockRejectedValue(axiosError(500, { message: "500 Internal Server Error" }));

    await expect(
      buildFactory().rotateCredentials({ tokenId: "77", token: "glpat-old" }, callback, {
        tokenId: "88",
        token: "glpat-active"
      })
    ).rejects.toThrow("Failed to revoke GitLab token '77' of group '34'");
    expect(postMock).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("treats a token GitLab no longer has as already revoked", async () => {
    deleteMock.mockRejectedValue(axiosError(404, { message: "404 Not Found" }));

    await buildFactory().rotateCredentials({ tokenId: "77", token: "glpat-old" }, callback, {
      tokenId: "88",
      token: "glpat-active"
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      tokenId: "101",
      token: "glpat-new"
    });
  });

  it("revokes every tracked token, tolerating ones that are already gone", async () => {
    deleteMock.mockResolvedValueOnce({ status: 204 }).mockRejectedValueOnce(axiosError(404, {}));

    await buildFactory().revokeCredentials(
      [
        { tokenId: "1", token: "a" },
        { tokenId: "2", token: "b" }
      ],
      callback
    );

    expect(deleteMock.mock.calls.map(([url]) => url)).toEqual([`${TOKENS_URL}/1`, `${TOKENS_URL}/2`]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("maps the token and its ID to the configured secrets", () => {
    expect(buildFactory().getSecretsPayload({ tokenId: "101", token: "glpat-new" })).toEqual([
      { key: "GITLAB_TOKEN_ID", value: "101" },
      { key: "GITLAB_TOKEN", value: "glpat-new" }
    ]);
  });
});

describe("GitLab group access token parameters", () => {
  it("defaults the token's role to Maintainer", () => {
    const result = CreateGitLabGroupAccessTokenRotationSchema.parse(createInput({ groupId: "0034" }));

    expect(result.parameters).toMatchObject({
      groupId: "34",
      accessLevel: GitLabTokenAccessLevel.Maintainer
    });
  });

  it("rejects a role GitLab does not offer", () => {
    expect(CreateGitLabGroupAccessTokenRotationSchema.safeParse(createInput({ accessLevel: 35 })).success).toBe(false);
  });

  it("rejects scopes only personal access tokens can have", () => {
    const result = CreateGitLabGroupAccessTokenRotationSchema.safeParse(
      createInput({
        scopes: [GitLabTokenScope.ReadApi, GitLabTokenScope.ReadUser]
      })
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["parameters", "scopes"],
      message: "Group access tokens cannot have the read_user scope"
    });
  });

  it("caps the rotation interval like other GitLab token rotations", () => {
    expect(
      CreateGitLabGroupAccessTokenRotationSchema.safeParse({
        ...createInput({}),
        rotationInterval: GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS + 1
      }).success
    ).toBe(false);
  });
});
