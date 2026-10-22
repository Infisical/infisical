import { vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { ChangeType, ResourceType } from "@app/services/folder-commit/folder-commit-service";

import { scanSecretPolicyViolations } from "../secret-scanning-v2/secret-scanning-v2-fns";
import { pitServiceFactory } from "./pit-service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../secret-scanning-v2/secret-scanning-v2-fns", () => ({ scanSecretPolicyViolations: vi.fn() }));

const buildService = ({ commitFolderId = "folder-1" }: { commitFolderId?: string } = {}) => {
  const getChangeVersions = vi.fn().mockResolvedValue([]);
  const compareFolderStates = vi.fn().mockResolvedValue([
    {
      type: ResourceType.SECRET,
      id: "change-1",
      secretKey: "DB_PASSWORD",
      secretVersion: "2",
      secretId: "secret-1",
      isUpdate: true,
      changeType: ChangeType.UPDATE,
      fromVersion: "1"
    }
  ]);
  const findEnv = vi.fn().mockResolvedValue({ id: "env-prod", slug: "prod" });
  const service = pitServiceFactory({
    folderCommitService: {
      getLatestCommit: vi.fn().mockResolvedValue({ id: "latest-commit" }),
      getCommitById: vi.fn().mockResolvedValue({ id: "target-commit", folderId: commitFolderId, envId: "env-prod" }),
      compareFolderStates
    },
    secretService: { getChangeVersions },
    folderService: {
      getFolderById: vi.fn().mockResolvedValue({
        id: "folder-1",
        name: "backend",
        path: "/app/backend"
      })
    },
    projectEnvDAL: {
      findOne: findEnv
    }
  } as unknown as Parameters<typeof pitServiceFactory>[0]);

  return { service, getChangeVersions, compareFolderStates, findEnv };
};

describe("compareCommitChanges", () => {
  test("checks secret versions against the absolute path of the commit's folder", async () => {
    const { service, getChangeVersions } = buildService();

    const { diffs } = await service.compareCommitChanges({
      actor: ActorType.USER,
      actorId: "user-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      projectId: "project-1",
      commitId: "target-commit",
      folderId: "folder-1",
      deepRollback: false
    });

    expect(getChangeVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        secretId: "secret-1",
        secretVersion: "2",
        id: "change-1"
      }),
      "1",
      "user-1",
      ActorType.USER,
      "org-1",
      null,
      "env-prod",
      "project-1",
      "/app/backend"
    );
    expect(diffs[0]?.folderPath).toBe("/app/backend");
  });

  test("resolves the environment and folder path from the commit", async () => {
    const { service, findEnv } = buildService();

    const { environment, folderPath } = await service.compareCommitChanges({
      actor: ActorType.USER,
      actorId: "user-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      projectId: "project-1",
      commitId: "target-commit",
      folderId: "folder-1",
      deepRollback: false
    });

    expect(findEnv).toHaveBeenCalledWith({ projectId: "project-1", id: "env-prod" });
    expect(environment).toBe("prod");
    expect(folderPath).toBe("/app/backend");
  });

  test("rejects a commit that belongs to a different folder", async () => {
    const { service, getChangeVersions, compareFolderStates } = buildService({ commitFolderId: "restricted-folder" });

    await expect(
      service.compareCommitChanges({
        actor: ActorType.USER,
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null,
        projectId: "project-1",
        commitId: "target-commit",
        folderId: "folder-1",
        deepRollback: false
      })
    ).rejects.toThrow("does not belong to folder");

    expect(compareFolderStates).not.toHaveBeenCalled();
    expect(getChangeVersions).not.toHaveBeenCalled();
  });
});

describe("processNewCommitRaw", () => {
  const TRX = { isTx: true };
  const approval = { id: "request-1", policyId: "policy-1", commits: [{ id: "commit-1" }] };
  const build = ({ withPolicy = true } = {}) => {
    const policy = withPolicy ? { id: "policy-1", bypassForMachineIdentities: false } : undefined;
    const deps = {
      secretApprovalPolicyService: { getSecretApprovalPolicy: vi.fn().mockResolvedValue(policy) },
      projectDAL: {
        findById: vi.fn().mockResolvedValue({ id: "project-1", secretDetectionIgnoreValues: ["ignored"] })
      },
      folderCommitDAL: { transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(TRX)) },
      folderDAL: { findBySecretPath: vi.fn().mockResolvedValue({ id: "folder-1" }) },
      secretApprovalRequestService: {
        generateSecretApprovalRequestV2Bridge: vi.fn().mockResolvedValue(approval),
        createSecretApprovalSideEffects: vi.fn().mockResolvedValue(undefined)
      },
      secretV2BridgeService: {
        createManySecret: vi.fn().mockResolvedValue([]),
        updateManySecret: vi.fn().mockResolvedValue([])
      }
    };
    const service = pitServiceFactory(deps as unknown as Parameters<typeof pitServiceFactory>[0]);
    const run = (secrets: object) =>
      service.processNewCommitRaw({
        actor: ActorType.USER,
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null,
        projectId: "project-1",
        environment: "dev",
        secretPath: "/",
        message: "",
        changes: { secrets, folders: {} } as unknown as Parameters<typeof service.processNewCommitRaw>[0]["changes"]
      });
    return { deps, run };
  };

  test("scans created and updated values before opening the transaction when a policy applies", async () => {
    const { deps, run } = build();
    const scan = vi.mocked(scanSecretPolicyViolations);
    scan.mockReset();
    scan.mockImplementationOnce(() => {
      throw new BadRequestError({ message: "Secret value detected in TOKEN." });
    });

    await expect(
      run({ create: [{ secretKey: "TOKEN", secretValue: "leak" }], update: [{ secretKey: "OTHER", secretValue: "v" }] })
    ).rejects.toThrow("Secret value detected in TOKEN.");

    expect(scan).toHaveBeenCalledWith(
      "project-1",
      "/",
      [
        { secretKey: "TOKEN", secretValue: "leak" },
        { secretKey: "OTHER", secretValue: "v" }
      ],
      ["ignored"]
    );
    expect(deps.folderCommitDAL.transaction).not.toHaveBeenCalled();
    expect(deps.secretApprovalRequestService.generateSecretApprovalRequestV2Bridge).not.toHaveBeenCalled();
  });

  test("leaves direct updates to updateManySecret's own scan when no policy applies", async () => {
    const { run } = build({ withPolicy: false });
    const scan = vi.mocked(scanSecretPolicyViolations);
    scan.mockReset();

    await run({ update: [{ secretKey: "OTHER", secretValue: "v" }] });

    expect(scan).not.toHaveBeenCalled();
  });

  test("opens the request in the caller's transaction and notifies approvers only after it commits", async () => {
    const { deps, run } = build();
    vi.mocked(scanSecretPolicyViolations).mockReset();

    const result = await run({ update: [{ secretKey: "OTHER", secretValue: "v" }] });

    expect(deps.secretApprovalRequestService.generateSecretApprovalRequestV2Bridge).toHaveBeenCalledWith(
      expect.objectContaining({ trx: TRX, skipPostProcessing: true })
    );
    expect(deps.secretApprovalRequestService.createSecretApprovalSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ secretApprovalRequest: approval, secretKeys: ["OTHER"] })
    );
    const sideEffectsOrder =
      deps.secretApprovalRequestService.createSecretApprovalSideEffects.mock.invocationCallOrder[0];
    const transactionOrder = deps.folderCommitDAL.transaction.mock.invocationCallOrder[0];
    expect(sideEffectsOrder).toBeGreaterThan(transactionOrder);
    expect(result).toMatchObject({ approvalId: "request-1" });
  });

  test("a failed notification does not fail the save", async () => {
    const { deps, run } = build();
    vi.mocked(scanSecretPolicyViolations).mockReset();
    deps.secretApprovalRequestService.createSecretApprovalSideEffects.mockRejectedValueOnce(new Error("smtp down"));

    await expect(run({ update: [{ secretKey: "OTHER", secretValue: "v" }] })).resolves.toMatchObject({
      approvalId: "request-1"
    });
  });
});
