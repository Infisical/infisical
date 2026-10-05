import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { SecretOperations } from "@app/services/secret/secret-types";

import { secretApprovalRequestCreationFnsFactory } from "./secret-approval-request-creation-fns";

const TX = { isTx: "caller" } as unknown as Knex;
const OWN_TX = { isTx: "own" } as unknown as Knex;
const POLICY = { id: "policy-1" };
const FOLDER_ID = "folder-1";
const ACTOR_ID = "user-1";
const BRIDGE_ERROR = new BadRequestError({ message: "bridge" });

const build = ({ isBridgePolicy = false } = {}) => {
  const withIds = async (rows: { key?: string }[]) => rows.map((row, index) => ({ id: `commit-${index}`, ...row }));
  const secretApprovalRequestDAL = {
    create: vi.fn().mockImplementation(async (doc: object) => ({ id: "request-1", ...doc })),
    transaction: vi.fn().mockImplementation(async (cb: (tx: Knex) => Promise<unknown>) => cb(OWN_TX))
  };
  const secretApprovalRequestSecretDAL = {
    insertMany: vi.fn().mockImplementation(withIds),
    insertV2Bridge: vi.fn().mockImplementation(withIds),
    insertApprovalSecretV2Tags: vi.fn().mockResolvedValue([])
  };
  const secretChangePolicyBridgeService = {
    findSecretChangePolicy: vi.fn().mockResolvedValue(isBridgePolicy ? POLICY : undefined)
  };
  const secretChangeRequestBridgeService = {
    createSecretChangeRequest: vi.fn().mockRejectedValue(BRIDGE_ERROR)
  };

  const fns = secretApprovalRequestCreationFnsFactory({
    secretApprovalRequestDAL,
    secretApprovalRequestSecretDAL,
    secretChangePolicyBridgeService,
    secretChangeRequestBridgeService
  });

  return {
    fns,
    secretApprovalRequestDAL,
    secretApprovalRequestSecretDAL,
    secretChangePolicyBridgeService,
    secretChangeRequestBridgeService
  };
};

const v2Dto = (overrides: Record<string, unknown> = {}) => ({
  policy: POLICY,
  folderId: FOLDER_ID,
  actor: ActorType.USER,
  actorId: ACTOR_ID,
  commits: [
    { op: SecretOperations.Create, key: "TAGGED", tagIds: ["tag-1", "tag-2"] },
    { op: SecretOperations.Delete, key: "PLAIN", secretId: "secret-2", secretVersion: "version-2" }
  ],
  ...overrides
});

const expectedRequestDoc: Record<string, unknown> = {
  folderId: FOLDER_ID,
  policyId: POLICY.id,
  status: "open",
  hasMerged: false,
  committerUserId: ACTOR_ID,
  committerIdentityId: undefined,
  slug: expect.any(String)
};

describe("createSecretApprovalRequestV2Bridge", () => {
  test("writes the request and its commits on the legacy tables inside the caller's transaction", async () => {
    const { fns, secretApprovalRequestDAL, secretApprovalRequestSecretDAL, secretChangePolicyBridgeService } = build();

    const result = await fns.createSecretApprovalRequestV2Bridge(v2Dto(), TX);

    expect(secretChangePolicyBridgeService.findSecretChangePolicy).toHaveBeenCalledWith(POLICY.id, TX);
    expect(secretApprovalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(secretApprovalRequestDAL.create).toHaveBeenCalledWith(
      { ...expectedRequestDoc, isReplicated: undefined, commitMessage: undefined },
      TX
    );
    expect(secretApprovalRequestSecretDAL.insertV2Bridge).toHaveBeenCalledWith(
      [
        { op: SecretOperations.Create, key: "TAGGED", requestId: "request-1" },
        {
          op: SecretOperations.Delete,
          key: "PLAIN",
          secretId: "secret-2",
          secretVersion: "version-2",
          requestId: "request-1"
        }
      ],
      TX
    );
    expect(secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).toHaveBeenCalledWith(
      [
        { secretId: "commit-0", tagId: "tag-1" },
        { secretId: "commit-0", tagId: "tag-2" }
      ],
      TX
    );
    expect(result).toMatchObject({ id: "request-1", commits: [{ id: "commit-0" }, { id: "commit-1" }] });
  });

  test("opens its own transaction when the caller has none", async () => {
    const { fns, secretApprovalRequestDAL, secretApprovalRequestSecretDAL, secretChangePolicyBridgeService } = build();

    await fns.createSecretApprovalRequestV2Bridge(
      v2Dto({ isReplicated: true, commitMessage: "replicated", commits: [{ op: SecretOperations.Create, key: "A" }] })
    );

    expect(secretChangePolicyBridgeService.findSecretChangePolicy).toHaveBeenCalledWith(POLICY.id, undefined);
    expect(secretApprovalRequestDAL.transaction).toHaveBeenCalledTimes(1);
    expect(secretApprovalRequestDAL.create).toHaveBeenCalledWith(
      { ...expectedRequestDoc, isReplicated: true, commitMessage: "replicated" },
      OWN_TX
    );
    expect(secretApprovalRequestSecretDAL.insertV2Bridge).toHaveBeenCalledWith(
      [{ op: SecretOperations.Create, key: "A", requestId: "request-1" }],
      OWN_TX
    );
    expect(secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).not.toHaveBeenCalled();
  });

  test("records an identity committer", async () => {
    const { fns, secretApprovalRequestDAL } = build();

    await fns.createSecretApprovalRequestV2Bridge(v2Dto({ actor: ActorType.IDENTITY, actorId: "identity-1" }), TX);

    expect(secretApprovalRequestDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ committerUserId: undefined, committerIdentityId: "identity-1" }),
      TX
    );
  });

  test("hands a request on a policy from the approval system to the bridge", async () => {
    const { fns, secretApprovalRequestDAL, secretApprovalRequestSecretDAL, secretChangeRequestBridgeService } = build({
      isBridgePolicy: true
    });
    const dto = v2Dto();

    await expect(fns.createSecretApprovalRequestV2Bridge(dto, TX)).rejects.toBe(BRIDGE_ERROR);

    expect(secretChangeRequestBridgeService.createSecretChangeRequest).toHaveBeenCalledWith(dto, TX);
    expect(secretApprovalRequestDAL.create).not.toHaveBeenCalled();
    expect(secretApprovalRequestSecretDAL.insertV2Bridge).not.toHaveBeenCalled();
  });
});

describe("createSecretApprovalRequest", () => {
  const commits = [{ op: SecretOperations.Delete, secretBlindIndex: "blind-1", secretId: "secret-1" }];

  test("writes the request and its v1 commits inside the caller's transaction", async () => {
    const { fns, secretApprovalRequestDAL, secretApprovalRequestSecretDAL } = build();

    const result = await fns.createSecretApprovalRequest(
      { policy: POLICY, folderId: FOLDER_ID, actor: ActorType.USER, actorId: ACTOR_ID, isReplicated: true, commits },
      TX
    );

    expect(secretApprovalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(secretApprovalRequestDAL.create).toHaveBeenCalledWith(
      { ...expectedRequestDoc, isReplicated: true, commitMessage: undefined },
      TX
    );
    expect(secretApprovalRequestSecretDAL.insertMany).toHaveBeenCalledWith(
      [{ ...commits[0], requestId: "request-1" }],
      TX
    );
    expect(secretApprovalRequestSecretDAL.insertV2Bridge).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "request-1", commits: [{ id: "commit-0" }] });
  });

  test("opens its own transaction when the caller has none", async () => {
    const { fns, secretApprovalRequestDAL, secretApprovalRequestSecretDAL } = build();

    await fns.createSecretApprovalRequest({
      policy: POLICY,
      folderId: FOLDER_ID,
      actor: ActorType.USER,
      actorId: ACTOR_ID,
      commits
    });

    expect(secretApprovalRequestDAL.transaction).toHaveBeenCalledTimes(1);
    expect(secretApprovalRequestDAL.create).toHaveBeenCalledWith(expect.any(Object), OWN_TX);
    expect(secretApprovalRequestSecretDAL.insertMany).toHaveBeenCalledWith(expect.any(Array), OWN_TX);
  });

  test("refuses a policy from the approval system, since v1 commits cannot reference a secret change request", async () => {
    const { fns, secretApprovalRequestDAL, secretApprovalRequestSecretDAL, secretChangeRequestBridgeService } = build({
      isBridgePolicy: true
    });

    await expect(
      fns.createSecretApprovalRequest(
        { policy: POLICY, folderId: FOLDER_ID, actor: ActorType.USER, actorId: ACTOR_ID, commits },
        TX
      )
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(secretChangeRequestBridgeService.createSecretChangeRequest).not.toHaveBeenCalled();
    expect(secretApprovalRequestDAL.create).not.toHaveBeenCalled();
    expect(secretApprovalRequestSecretDAL.insertMany).not.toHaveBeenCalled();
  });
});
