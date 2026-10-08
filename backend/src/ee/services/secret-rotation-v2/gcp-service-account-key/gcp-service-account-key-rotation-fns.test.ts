import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretRotationV2Raw } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";

const { postMock, deleteMock, authorizeMock, delayMock } = vi.hoisted(() => ({
  postMock: vi.fn<(url: string, body?: unknown, config?: unknown) => Promise<unknown>>(),
  deleteMock: vi.fn<(url: string, config?: unknown) => Promise<unknown>>(),
  authorizeMock: vi.fn<() => Promise<unknown>>(),
  delayMock: vi.fn<(ms: number) => Promise<void>>()
}));

vi.mock("@app/lib/config/request", () => ({
  request: { post: postMock, delete: deleteMock }
}));
vi.mock("@app/services/app-connection/gcp", () => ({
  getGcpConnectionAuthToken: vi.fn(async () => "access-token")
}));
// Stands in for GCP's token endpoint, which is where a new key is accepted or rejected.
vi.mock("google-auth-library", () => ({
  JWT: class {
    authorize = authorizeMock;
  }
}));
vi.mock("@app/lib/delay", () => ({
  delay: delayMock
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { gcpServiceAccountKeyRotationFactory } from "./gcp-service-account-key-rotation-fns";
// eslint-disable-next-line import/first
import {
  TGcpServiceAccountKeyRotationGeneratedCredentials,
  TGcpServiceAccountKeyRotationWithConnection
} from "./gcp-service-account-key-rotation-types";

type TCredential = TGcpServiceAccountKeyRotationGeneratedCredentials[number];

const SERVICE_ACCOUNT_EMAIL = "my-app@my-project.iam.gserviceaccount.com";
const KEY_FILE = JSON.stringify({ client_email: SERVICE_ACCOUNT_EMAIL, private_key: "private-key" });

const OLD_KEY: TCredential = { keyId: "old-key-id", serviceAccountKey: KEY_FILE };
const NEW_KEY: TCredential = { keyId: "new-key-id", serviceAccountKey: KEY_FILE };

/** The rotation service hands the factory a transaction body; this stands in for its return. */
const COMMITTED = "committed" as unknown as TSecretRotationV2Raw;

// The factory only talks to GCP through the mocked connection token and request client, so none of
// these are reached.
const UNUSED_DEPENDENCIES = [{}, {}, {}, {}, {}] as unknown as [
  Parameters<typeof gcpServiceAccountKeyRotationFactory>[1],
  Parameters<typeof gcpServiceAccountKeyRotationFactory>[2],
  Parameters<typeof gcpServiceAccountKeyRotationFactory>[3],
  Parameters<typeof gcpServiceAccountKeyRotationFactory>[4],
  Parameters<typeof gcpServiceAccountKeyRotationFactory>[5]
];

const makeFactory = ({ activeIndex = 0 }: { activeIndex?: number } = {}) =>
  gcpServiceAccountKeyRotationFactory(
    {
      connection: {},
      parameters: { serviceAccountEmail: SERVICE_ACCOUNT_EMAIL },
      secretsMapping: { serviceAccountKey: "GCP_SERVICE_ACCOUNT_KEY" },
      activeIndex
    } as unknown as TGcpServiceAccountKeyRotationWithConnection,
    ...UNUSED_DEPENDENCIES
  );

/** Every GCP round trip and every commit, in the order they happened. */
let calls: string[] = [];

const httpError = (status: number, message: string) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: { error: { message } }
  });

const mockGcp = ({
  deleteKey
}: {
  /** Throw to fail the delete of the named key; return to delete it. */
  deleteKey?: (keyId: string) => Promise<void>;
} = {}) => {
  postMock.mockImplementation(async (url) => {
    if (!url.endsWith("/keys")) throw new Error(`unexpected POST ${url}`);

    calls.push("create");
    return {
      data: {
        name: `projects/my-project/serviceAccounts/${SERVICE_ACCOUNT_EMAIL}/keys/${NEW_KEY.keyId}`,
        privateKeyData: Buffer.from(KEY_FILE).toString("base64")
      }
    };
  });

  deleteMock.mockImplementation(async (url) => {
    const keyId = url.split("/").pop()!;
    calls.push(`delete:${keyId}`);
    await deleteKey?.(keyId);
    return { data: {} };
  });

  authorizeMock.mockImplementation(async () => {
    calls.push("authorize");
    return {};
  });
};

const commit = vi.fn(async (credentials: TCredential) => {
  calls.push("commit");
  return credentials as unknown as TSecretRotationV2Raw;
});

const commitWithoutCredentials = vi.fn(async () => {
  calls.push("commit");
  return COMMITTED;
});

describe("gcpServiceAccountKeyRotationFactory", () => {
  beforeEach(() => {
    calls = [];
    postMock.mockReset();
    deleteMock.mockReset();
    authorizeMock.mockReset();
    commit.mockClear();
    commitWithoutCredentials.mockClear();
  });

  describe("issueCredentials", () => {
    it("creates a key and hands the decoded key file to the callback without waiting for GCP", async () => {
      mockGcp();

      const result = await makeFactory().issueCredentials(commit);

      expect(result).toEqual(NEW_KEY);
      expect(calls).toEqual(["create", "commit"]);
      expect(postMock.mock.calls[0][0]).toBe(
        `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(SERVICE_ACCOUNT_EMAIL)}/keys`
      );
    });

    it("deletes the new key when the commit fails", async () => {
      mockGcp();

      await expect(
        makeFactory().issueCredentials(async () => {
          throw new Error("conflicting secret");
        })
      ).rejects.toThrow("conflicting secret");

      expect(calls).toEqual(["create", "delete:new-key-id"]);
    });
  });

  describe("rotateCredentials", () => {
    it("deletes the previous key before committing the new one", async () => {
      mockGcp();

      await makeFactory().rotateCredentials(OLD_KEY, commit, NEW_KEY);

      expect(calls).toEqual(["create", "delete:old-key-id", "commit"]);
      expect(commit).toHaveBeenCalledWith(NEW_KEY);
    });

    it("waits until GCP accepts the new key when running as a background job", async () => {
      mockGcp();
      authorizeMock.mockImplementationOnce(async () => {
        calls.push("authorize");
        throw new Error("invalid_grant: Invalid JWT Signature.");
      });

      await makeFactory().rotateCredentials(OLD_KEY, commit, NEW_KEY, { isBackgroundJob: true });

      expect(calls).toEqual(["create", "authorize", "authorize", "delete:old-key-id", "commit"]);
    });

    it("deletes the new key and keeps the previous one when GCP never accepts the new key", async () => {
      mockGcp();
      authorizeMock.mockRejectedValue(new Error("invalid_grant: Invalid JWT Signature."));

      await expect(
        makeFactory().rotateCredentials(OLD_KEY, commit, NEW_KEY, { isBackgroundJob: true })
      ).rejects.toThrow("GCP did not accept the new key");

      expect(calls).toEqual(["create", "delete:new-key-id"]);
      expect(commit).not.toHaveBeenCalled();
    });

    it("deletes the new key and fails when deleting the previous key fails", async () => {
      mockGcp({
        deleteKey: async (keyId) => {
          if (keyId === OLD_KEY.keyId) throw httpError(500, "GCP is down");
        }
      });

      await expect(makeFactory().rotateCredentials(OLD_KEY, commit, NEW_KEY)).rejects.toThrow("GCP is down");

      expect(calls).toEqual(["create", "delete:old-key-id", "delete:new-key-id"]);
      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe("revokeCredentials", () => {
    it.each([
      { activeIndex: 0, expected: ["delete:key-two", "delete:key-one", "commit"] },
      { activeIndex: 1, expected: ["delete:key-one", "delete:key-two", "commit"] }
    ])("deletes the active key last (activeIndex $activeIndex)", async ({ activeIndex, expected }) => {
      mockGcp();

      const result = await makeFactory({ activeIndex }).revokeCredentials(
        [
          { keyId: "key-one", serviceAccountKey: KEY_FILE },
          { keyId: "key-two", serviceAccountKey: KEY_FILE }
        ],
        commitWithoutCredentials
      );

      expect(calls).toEqual(expected);
      expect(result).toBe(COMMITTED);
    });
  });

  describe("checkActiveCredentials", () => {
    it("passes when GCP accepts the key and fails when GCP rejects it", async () => {
      authorizeMock.mockResolvedValueOnce({});
      await expect(makeFactory().checkActiveCredentials!(NEW_KEY)).resolves.toBeUndefined();

      authorizeMock.mockRejectedValueOnce(new Error("invalid_grant: Invalid JWT Signature."));
      await expect(makeFactory().checkActiveCredentials!(NEW_KEY)).rejects.toThrow("Invalid JWT Signature");
    });
  });
});
