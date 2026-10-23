import { describe, expect, it, vi } from "vitest";

import { GitLabSecretScanningFactory } from "./gitlab-secret-scanning-factory";

const { mockCloneRepository, mockGetGitLabInstanceUrl } = vi.hoisted(() => ({
  mockCloneRepository: vi.fn().mockResolvedValue(undefined),
  mockGetGitLabInstanceUrl: vi.fn().mockImplementation(async (instanceUrl?: string) => {
    if (!instanceUrl) return "https://gitlab.com";
    if (instanceUrl.includes("invalid-scheme")) throw new Error("Invalid URL scheme");
    if (instanceUrl.includes("127.0.0.1") || instanceUrl.includes("10.0.0.1")) throw new Error("Private IP blocked");
    return instanceUrl.replace(/\/+$/, "");
  })
}));

vi.mock("@app/services/app-connection/gitlab/gitlab-connection-fns", () => ({
  getGitLabConnectionClient: vi.fn().mockResolvedValue({
    Commits: {
      showDiff: vi.fn().mockResolvedValue([
        {
          newPath: "path/to/file.txt",
          diff: "+ secret: abcdef"
        }
      ])
    },
    Projects: {
      show: vi.fn().mockResolvedValue({
        statistics: { repositorySize: 1024 }
      })
    },
    Users: { showCurrentUser: vi.fn().mockResolvedValue({ username: "gituser" }) }
  }),
  getGitLabInstanceUrl: mockGetGitLabInstanceUrl
}));

vi.mock("@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns", () => ({
  scanContentAndGetFindings: vi.fn().mockResolvedValue([
    {
      RuleID: "TEST_RULE",
      StartLine: 1,
      EndLine: 1,
      StartColumn: 1,
      EndColumn: 1,
      Attributes: {}
    }
  ])
}));

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({
    SECRET_SCANNING_MAX_REPO_SIZE_MB: 5120
  })
}));

vi.mock("@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns")>();
  return {
    ...actual,
    cloneRepository: mockCloneRepository,
    convertPatchLineToFileLineNumber: vi.fn().mockReturnValue(10)
  };
});

describe("GitLab Secret Scanning Factory - Finding URLs and Clone URLs", () => {
  const createTestPayload = () => ({
    commits: [
      {
        id: "commit123456",
        author: { name: "Alice", email: "alice@example.com" },
        timestamp: "2026-01-01T00:00:00Z",
        message: "test commit"
      }
    ],
    project: { id: 42, path_with_namespace: "group/project" }
  });

  const factory = GitLabSecretScanningFactory({
    appConnectionDAL: {} as any,
    kmsService: {} as any
  });

  it("produces correct finding URL for standard gitlab.com", async () => {
    const findings = await factory.getDiffScanFindingsPayload({
      dataSource: {
        connection: {
          credentials: { instanceUrl: undefined }
        }
      } as any,
      payload: createTestPayload() as any,
      resourceName: "group/project",
      configPath: ""
    });

    const link = (findings[0].details as { link?: string })?.link;
    expect(link).toBe("https://gitlab.com/group/project/blob/commit123456/path/to/file.txt#L10");
  });

  it("produces correct finding URL with custom domain", async () => {
    const findings = await factory.getDiffScanFindingsPayload({
      dataSource: {
        connection: {
          credentials: { instanceUrl: "https://git.company.com" }
        }
      } as any,
      payload: createTestPayload() as any,
      resourceName: "group/project",
      configPath: ""
    });

    const link = (findings[0].details as { link?: string })?.link;
    expect(link).toBe("https://git.company.com/group/project/blob/commit123456/path/to/file.txt#L10");
  });

  it("produces correct finding URL with self-hosted instance and path prefix", async () => {
    const findings = await factory.getDiffScanFindingsPayload({
      dataSource: {
        connection: {
          credentials: { instanceUrl: "https://gitlab.example.com/gitlab" }
        }
      } as any,
      payload: createTestPayload() as any,
      resourceName: "group/project",
      configPath: ""
    });

    const link = (findings[0].details as { link?: string })?.link;
    expect(link).toBe("https://gitlab.example.com/gitlab/group/project/blob/commit123456/path/to/file.txt#L10");
  });

  it("handles trailing slash in instanceUrl without duplicating slashes", async () => {
    const findings = await factory.getDiffScanFindingsPayload({
      dataSource: {
        connection: {
          credentials: { instanceUrl: "https://gitlab.example.com/gitlab/" }
        }
      } as any,
      payload: createTestPayload() as any,
      resourceName: "group/project",
      configPath: ""
    });

    const link = (findings[0].details as { link?: string })?.link;
    expect(link).toBe("https://gitlab.example.com/gitlab/group/project/blob/commit123456/path/to/file.txt#L10");
  });

  it("preserves HTTP scheme and custom port", async () => {
    const findings = await factory.getDiffScanFindingsPayload({
      dataSource: {
        connection: {
          credentials: { instanceUrl: "http://gitlab.internal:8080" }
        }
      } as any,
      payload: createTestPayload() as any,
      resourceName: "group/project",
      configPath: ""
    });

    const link = (findings[0].details as { link?: string })?.link;
    expect(link).toBe("http://gitlab.internal:8080/group/project/blob/commit123456/path/to/file.txt#L10");
  });

  it("sanitizes leading and trailing slashes in resourceName and file path", async () => {
    const findings = await factory.getDiffScanFindingsPayload({
      dataSource: {
        connection: {
          credentials: { instanceUrl: "https://git.example.com/subpath" }
        }
      } as any,
      payload: createTestPayload() as any,
      resourceName: "/group/project/",
      configPath: ""
    });

    const link = (findings[0].details as { link?: string })?.link;
    expect(link).toBe("https://git.example.com/subpath/group/project/blob/commit123456/path/to/file.txt#L10");
  });

  it("rejects when instanceUrl is invalid or targets private IP", async () => {
    await expect(
      factory.getDiffScanFindingsPayload({
        dataSource: {
          connection: {
            credentials: { instanceUrl: "https://127.0.0.1" }
          }
        } as any,
        payload: createTestPayload() as any,
        resourceName: "group/project",
        configPath: ""
      })
    ).rejects.toThrow("Private IP blocked");
  });

  it("constructs correct cloneUrl in getFullScanPath preserving scheme, port, and path prefix", async () => {
    mockCloneRepository.mockClear();

    await factory.getFullScanPath({
      dataSource: {
        connection: {
          credentials: {
            instanceUrl: "https://gitlab.example.com/gitlab",
            accessToken: "test-pat-token"
          }
        }
      } as any,
      resourceName: "group/project",
      tempFolder: "/tmp/test"
    });

    expect(mockCloneRepository).toHaveBeenCalledWith({
      cloneUrl: "https://gituser:test-pat-token@gitlab.example.com/gitlab/group/project.git",
      repoPath: expect.any(String)
    });
  });
});
