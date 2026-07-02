import { afterEach, describe, expect, it, vi } from "vitest";

import { cloneRepository, parseScanErrorMessage } from "./secret-scanning-v2-fns";

type ExecFileCallback = (err: Error | null) => void;
type ExecFileCall = [string, string[], { env?: NodeJS.ProcessEnv }, ExecFileCallback];

const { execFileMock, rmMock } = vi.hoisted(() => ({
  execFileMock: vi.fn<(...args: ExecFileCall) => void>(),
  rmMock: vi.fn()
}));

vi.mock("child_process", () => ({
  execFile: execFileMock
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();

  rmMock.mockImplementation(actual.rm);

  return {
    ...actual,
    rm: rmMock
  };
});

const repoPath = "/tmp/infisical-secret-scanning-test-repo.git";
const fakeToken = "ghs_fake_secret_token";
const gitUrlAuthSeparator = String.fromCharCode(64);
const makeCredentialedGitHubUrl = (repository: string) =>
  [`https://x-access-token:${fakeToken}`, `github.com/${repository}.git`].join(gitUrlAuthSeparator);
const credentialedGitHubUrl = makeCredentialedGitHubUrl("infisical/infisical");

const getLastExecFileCall = (): ExecFileCall => {
  const call = execFileMock.mock.calls.at(-1);
  if (!call) throw new Error("Expected execFile to be called");
  return call;
};

const waitForLastExecFileCall = async () => {
  await vi.waitFor(() => expect(execFileMock).toHaveBeenCalled());
  return getLastExecFileCall();
};

const resolveLastExecFileCall = (error: Error | null = null) => {
  getLastExecFileCall()[3](error);
};

const getLastExecFileOptions = () => getLastExecFileCall()[2];

describe("secret scanning v2 git clone auth", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GIT_TRACE;
    delete process.env.GIT_TRACE_PACKET;
    delete process.env.GIT_TRACE_CURL;
    delete process.env.GIT_CURL_VERBOSE;
    delete process.env.GIT_TRACE2;
    delete process.env.GIT_TRACE2_EVENT;
  });

  it("redacts credentials embedded in URLs before exposing scan errors", () => {
    const result = parseScanErrorMessage(new Error(`Command failed: git clone ${credentialedGitHubUrl}`));

    expect(result).not.toContain(fakeToken);
    expect(result).toContain("https://[redacted]@github.com/infisical/infisical.git");
  });

  it("redacts authorization header values before exposing scan errors", () => {
    const result = parseScanErrorMessage(
      new Error(`fatal: request failed with Authorization: Bearer ${fakeToken} and Authorization: Basic abc123`)
    );

    expect(result).not.toContain(fakeToken);
    expect(result).not.toContain("abc123");
    expect(result).toContain("Authorization: Bearer [redacted]");
    expect(result).toContain("Authorization: Basic [redacted]");
  });

  it("truncates scan errors after redacting secrets", () => {
    const result = parseScanErrorMessage(new Error(`${makeCredentialedGitHubUrl("a/b")} ${"x".repeat(1200)}`));

    expect(result).toHaveLength(1024);
    expect(result).not.toContain(fakeToken);
    expect(result.endsWith("...")).toBe(true);
  });

  it("rejects clone URLs that contain embedded credentials", async () => {
    await expect(
      cloneRepository({
        remoteUrl: credentialedGitHubUrl,
        repoPath
      })
    ).rejects.toThrow(/credentials/i);

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("passes a credential-free remote URL to git clone while providing auth through askpass", async () => {
    const clonePromise = cloneRepository({
      remoteUrl: "https://github.com/infisical/infisical.git",
      repoPath,
      auth: {
        username: "x-access-token",
        password: fakeToken
      }
    });
    void clonePromise.catch(() => undefined);

    const [command, args] = await waitForLastExecFileCall();
    const options = getLastExecFileOptions();

    expect(command).toBe("git");
    expect(args).toEqual([
      "-c",
      "credential.helper=",
      "clone",
      "https://github.com/infisical/infisical.git",
      repoPath,
      "--bare"
    ]);
    expect(JSON.stringify(args)).not.toContain(fakeToken);
    expect(options?.env?.GIT_ASKPASS).toContain("git-askpass");
    expect(options?.env?.GIT_TERMINAL_PROMPT).toBe("0");
    expect(options?.env?.INFISICAL_GIT_USERNAME).toBe("x-access-token");
    expect(options?.env?.INFISICAL_GIT_PASSWORD).toBe(fakeToken);

    resolveLastExecFileCall();
    await expect(clonePromise).resolves.toBeUndefined();
  });

  it("removes inherited git trace environment variables before cloning", async () => {
    process.env.GIT_TRACE = "1";
    process.env.GIT_TRACE_PACKET = "1";
    process.env.GIT_TRACE_CURL = "1";
    process.env.GIT_CURL_VERBOSE = "1";
    process.env.GIT_TRACE2 = "1";
    process.env.GIT_TRACE2_EVENT = "/tmp/git-trace";

    const clonePromise = cloneRepository({
      remoteUrl: "https://github.com/infisical/infisical.git",
      repoPath,
      auth: {
        username: "x-access-token",
        password: fakeToken
      }
    });
    void clonePromise.catch(() => undefined);

    await waitForLastExecFileCall();

    const env = getLastExecFileOptions()?.env;
    expect(env?.GIT_TRACE).toBeUndefined();
    expect(env?.GIT_TRACE_PACKET).toBeUndefined();
    expect(env?.GIT_TRACE_CURL).toBeUndefined();
    expect(env?.GIT_CURL_VERBOSE).toBeUndefined();
    expect(env?.GIT_TRACE2).toBeUndefined();
    expect(env?.GIT_TRACE2_EVENT).toBeUndefined();

    resolveLastExecFileCall();
    await expect(clonePromise).resolves.toBeUndefined();
  });

  it("does not fail a successful clone when askpass cleanup fails", async () => {
    rmMock.mockRejectedValueOnce(new Error("EPERM cleanup failed"));

    const clonePromise = cloneRepository({
      remoteUrl: "https://github.com/infisical/infisical.git",
      repoPath,
      auth: {
        username: "x-access-token",
        password: fakeToken
      }
    });
    void clonePromise.catch(() => undefined);

    await waitForLastExecFileCall();

    resolveLastExecFileCall();

    await expect(clonePromise).resolves.toBeUndefined();
  });

  it("does not replace sanitized clone failures with askpass cleanup errors", async () => {
    rmMock.mockRejectedValueOnce(new Error(`EPERM cleanup failed: ${fakeToken}`));

    const clonePromise = cloneRepository({
      remoteUrl: "https://github.com/infisical/infisical.git",
      repoPath,
      auth: {
        username: "x-access-token",
        password: fakeToken
      }
    });
    void clonePromise.catch(() => undefined);

    await waitForLastExecFileCall();

    resolveLastExecFileCall(new Error(`Command failed: git clone ${credentialedGitHubUrl}`));

    await expect(clonePromise).rejects.toThrow("https://[redacted]@github.com/infisical/infisical.git");
    await expect(clonePromise).rejects.not.toThrow("EPERM cleanup failed");
    await expect(clonePromise).rejects.not.toThrow(fakeToken);
  });

  it("rejects clone failures with a sanitized error", async () => {
    const clonePromise = cloneRepository({
      remoteUrl: "https://github.com/infisical/infisical.git",
      repoPath,
      auth: {
        username: "x-access-token",
        password: fakeToken
      }
    });
    void clonePromise.catch(() => undefined);

    await waitForLastExecFileCall();

    resolveLastExecFileCall(new Error(`Command failed: git clone ${credentialedGitHubUrl}`));

    await expect(clonePromise).rejects.toThrow("https://[redacted]@github.com/infisical/infisical.git");
    await expect(clonePromise).rejects.not.toThrow(fakeToken);
  });
});
