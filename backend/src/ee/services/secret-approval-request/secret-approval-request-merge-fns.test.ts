import { describe, expect, test, vi } from "vitest";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { SecretOperations } from "@app/services/secret/secret-types";

import {
  buildRequestedByActor,
  buildSecretMutationEvents,
  secretApprovalRequestMergeFnsFactory,
  TMergedSecretsV2Bridge,
  TSecretApprovalBridgeCommit
} from "./secret-approval-request-merge-fns";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.test" }) }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const commit = (overrides: Record<string, unknown>) =>
  ({
    id: `commit-${String(overrides.key)}`,
    tags: [],
    secretVersion: undefined,
    secret: undefined,
    ...overrides
  }) as unknown as TSecretApprovalBridgeCommit;

const buildFns = (liveSecrets: { id: string; key: string }[]) => {
  const secretV2BridgeDAL = { findBySecretKeys: vi.fn().mockResolvedValue(liveSecrets) };
  const fns = secretApprovalRequestMergeFnsFactory({
    secretV2BridgeDAL
  } as unknown as Parameters<typeof secretApprovalRequestMergeFnsFactory>[0]);
  return { fns, secretV2BridgeDAL };
};

describe("detectSecretApprovalCommitConflicts", () => {
  test("splits commits by operation and keeps deletes unchecked", async () => {
    const { fns, secretV2BridgeDAL } = buildFns([]);
    const creates = commit({ op: SecretOperations.Create, key: "A" });
    const deletes = commit({ op: SecretOperations.Delete, key: "B", secretId: "secret-b" });

    const result = await fns.detectSecretApprovalCommitConflicts({ folderId: "folder-1", commits: [creates, deletes] });

    expect(result).toEqual({ conflicts: [], creates: [creates], updates: [], deletes: [deletes] });
    expect(secretV2BridgeDAL.findBySecretKeys).toHaveBeenCalledTimes(1);
  });

  test("marks a create whose key now exists as a conflict keyed by the commit row", async () => {
    const { fns } = buildFns([{ id: "secret-a", key: "A" }]);
    const taken = commit({ op: SecretOperations.Create, key: "A" });
    const free = commit({ op: SecretOperations.Create, key: "C" });

    const result = await fns.detectSecretApprovalCommitConflicts({ folderId: "folder-1", commits: [taken, free] });

    expect(result.conflicts).toEqual([{ op: SecretOperations.Create, secretId: "commit-A" }]);
    expect(result.creates).toEqual([free]);
  });

  test("marks an update whose secret was deleted or whose key moved to another secret as a conflict", async () => {
    const { fns } = buildFns([
      { id: "secret-other", key: "A" },
      { id: "secret-b", key: "B" }
    ]);
    const deletedTarget = commit({ op: SecretOperations.Update, key: "Z", secretId: null, secret: undefined });
    const keyTaken = commit({
      op: SecretOperations.Update,
      key: "A",
      secretId: "secret-a",
      secret: { id: "secret-a", key: "A" }
    });
    const clean = commit({
      op: SecretOperations.Update,
      key: "B",
      secretId: "secret-b",
      secret: { id: "secret-b", key: "B" },
      secretVersion: { id: "version-b", key: "B" }
    });

    const result = await fns.detectSecretApprovalCommitConflicts({
      folderId: "folder-1",
      commits: [deletedTarget, keyTaken, clean]
    });

    expect(result.conflicts).toEqual([
      { op: SecretOperations.Update, secretId: "commit-Z" },
      { op: SecretOperations.Update, secretId: "commit-A" }
    ]);
    expect(result.updates).toEqual([clean]);
  });

  test("refuses a request that creates the same key twice before reading the folder", async () => {
    const { fns, secretV2BridgeDAL } = buildFns([]);
    const commits = [
      commit({ op: SecretOperations.Create, key: "A", id: "commit-A-1" }),
      commit({ op: SecretOperations.Create, key: "A", id: "commit-A-2" }),
      commit({ op: SecretOperations.Create, key: "B" })
    ];

    const result = fns.detectSecretApprovalCommitConflicts({ folderId: "folder-1", commits });

    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow("it creates secret 'A' more than once");
    expect(secretV2BridgeDAL.findBySecretKeys).not.toHaveBeenCalled();
  });
});

describe("buildSecretMutationEvents", () => {
  const secret = (id: string, key: string, version = 2) => ({
    id,
    key,
    version,
    tags: [{ name: "team" }],
    secretMetadata: [
      { key: "owner", value: "alice" },
      { key: "token", encryptedValue: "ZW5j" }
    ]
  });
  const secrets = (overrides: Record<string, unknown[]>) =>
    ({ created: [], updated: [], deleted: [], ...overrides }) as unknown as TMergedSecretsV2Bridge;

  test("emits singular events for one secret and masks encrypted metadata", () => {
    const events = buildSecretMutationEvents({
      environment: "dev",
      secretPath: "/app",
      secrets: secrets({ created: [secret("s1", "A")], deleted: [secret("s2", "B", 5)] })
    });

    expect(events).toEqual([
      {
        type: EventType.CREATE_SECRET,
        metadata: {
          environment: "dev",
          secretPath: "/app",
          secretId: "s1",
          secretVersion: 1,
          secretKey: "A",
          secretMetadata: [
            { key: "owner", isEncrypted: false, value: "alice" },
            { key: "token", isEncrypted: true, value: AUDIT_LOG_SENSITIVE_VALUE }
          ],
          secretTags: ["team"]
        }
      },
      {
        type: EventType.DELETE_SECRET,
        metadata: { environment: "dev", secretPath: "/app", secretId: "s2", secretVersion: 5, secretKey: "B" }
      }
    ]);
  });

  test("emits plural events for several secrets", () => {
    const events = buildSecretMutationEvents({
      environment: "dev",
      secretPath: "/",
      secrets: secrets({ updated: [secret("s1", "A", 3), secret("s2", "B", 4)] })
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: EventType.UPDATE_SECRETS,
      metadata: {
        secrets: [
          { secretId: "s1", secretVersion: 3, secretKey: "A" },
          { secretId: "s2", secretVersion: 4, secretKey: "B" }
        ]
      }
    });
  });

  test("emits nothing when nothing changed", () => {
    expect(buildSecretMutationEvents({ environment: "dev", secretPath: "/", secrets: secrets({}) })).toEqual([]);
  });
});

describe("buildRequestedByActor", () => {
  test("prefers the committing user, then the committing identity, then nothing", () => {
    expect(
      buildRequestedByActor({ committerUserId: "user-1", committerUser: { email: "a@x.io", username: "a@x.io" } })
    ).toEqual({ type: ActorType.USER, metadata: { userId: "user-1", email: "a@x.io", username: "a@x.io" } });

    expect(buildRequestedByActor({ committerIdentity: { identityId: "identity-1", name: "ci" } })).toEqual({
      type: ActorType.IDENTITY,
      metadata: { identityId: "identity-1", name: "ci" }
    });

    expect(buildRequestedByActor({})).toBeUndefined();
  });
});

describe("notifySecretApprovalBypass", () => {
  const build = () => {
    const deps = {
      userDAL: {
        findOne: vi.fn().mockResolvedValue({ firstName: "Alice", lastName: "Smith", email: "alice@example.com" }),
        find: vi.fn().mockResolvedValue([
          { id: "user-2", email: "bob@example.com" },
          { id: "user-3", email: "eve@example.com" }
        ])
      },
      notificationService: { createUserNotifications: vi.fn().mockResolvedValue(undefined) },
      smtpService: { sendMail: vi.fn().mockResolvedValue(undefined) }
    };
    const fns = secretApprovalRequestMergeFnsFactory(
      deps as unknown as Parameters<typeof secretApprovalRequestMergeFnsFactory>[0]
    );
    const run = () =>
      fns.notifySecretApprovalBypass({
        project: { id: "project-1", name: "Project", orgId: "org-1" },
        environmentName: "Development",
        secretPath: "/",
        actorId: "user-1",
        approverUserIds: ["user-2", "user-3"],
        bypassReason: "hotfix"
      });
    return { deps, run };
  };

  test("a failed bypass email does not reject, and approvers still get the in-app notification", async () => {
    const { deps, run } = build();
    deps.smtpService.sendMail.mockRejectedValueOnce(new Error("Invalid login: 535 Authentication Credentials Invalid"));

    await expect(run()).resolves.toBeUndefined();
    expect(deps.smtpService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ["bob@example.com", "eve@example.com"] })
    );
    expect(deps.notificationService.createUserNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "user-2" }),
      expect.objectContaining({ userId: "user-3" })
    ]);
  });
});
