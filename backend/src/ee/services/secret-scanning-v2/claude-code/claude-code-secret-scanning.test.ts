import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { ClaudeCodeSecretDetectedAction } from "./claude-code-secret-scanning-enums";
import { ClaudeCodeSecretScanningFactory } from "./claude-code-secret-scanning-factory";
import { getClaudeCodeFindingFingerprint } from "./claude-code-secret-scanning-fns";
import { claudeCodeSecretScanningService } from "./claude-code-secret-scanning-service";
import { TClaudeCodeDataSourceWithConnection, TClaudeCodePromptSubmission } from "./claude-code-secret-scanning-types";

const mockScanContentAndGetFindings = vi.fn<(content: string, configPath?: string) => Promise<unknown[]>>();

vi.mock("@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns", () => ({
  scanContentAndGetFindings: (content: string, configPath?: string) =>
    mockScanContentAndGetFindings(content, configPath)
}));

const PROJECT_ID = "project-1";
const DATA_SOURCE_ID = "6f1c1c2e-8a4b-4f0e-9a51-0b8d7d3f1e2a";

// encryption is reversible base64 here, so the queued payload can be checked
const kmsService = {
  createCipherPairWithDataKey: vi.fn(async () => ({
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: Buffer.from(plainText) }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => Buffer.from(cipherTextBlob)
  }))
};

const actor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: null,
  orgId: "org-1",
  rootOrgId: "org-1",
  parentOrgId: "org-1"
};

const submitter = { id: "user-1", name: "jane", email: "jane@example.com" };

const setup = ({
  findings = [] as { fingerprint: string; status: string }[],
  type = SecretScanningDataSource.ClaudeCode,
  canTriggerScans = true,
  config = {} as Record<string, unknown>
} = {}) => {
  const secretScanningV2DAL = {
    dataSources: {
      findById: vi.fn(async () => ({ id: DATA_SOURCE_ID, projectId: PROJECT_ID, type, config }))
    },
    findings: {
      findStatusesByProjectIdAndFingerprints: vi.fn(async () => findings)
    }
  };
  const secretScanningV2Queue = { queueResourceDiffScan: vi.fn(async () => {}) };

  const permission = createMongoAbility(
    canTriggerScans
      ? [
          {
            action: ProjectPermissionSecretScanningDataSourceActions.TriggerScans,
            subject: ProjectPermissionSub.SecretScanningDataSources
          }
        ]
      : []
  );

  const service = claudeCodeSecretScanningService({
    secretScanningV2DAL: secretScanningV2DAL as never,
    secretScanningV2Queue: secretScanningV2Queue as never,
    kmsService: kmsService as never,
    permissionService: { getProjectPermission: vi.fn(async () => ({ permission })) } as never,
    licenseService: { getPlan: vi.fn(async () => ({ secretScanning: true })) } as never
  });

  return { service, secretScanningV2DAL, secretScanningV2Queue };
};

const submit = (service: ReturnType<typeof setup>["service"], fingerprints: string[]) =>
  service.submitPrompt(
    { dataSourceId: DATA_SOURCE_ID, prompt: "my token ghp_test", fingerprints, submitter, cwd: "/repo" },
    actor as never
  );

describe("getClaudeCodeFindingFingerprint", () => {
  test("hashes the secret the same way as the plugin", () => {
    // printf 'ghp_test' | shasum -a 256
    expect(getClaudeCodeFindingFingerprint("ghp_test")).toBe(
      "8f23f423a895e68982c00878a9542c101b16b640b96c828c71ccc5736d0675ca"
    );
  });
});

describe("claudeCodeSecretScanningService.submitPrompt", () => {
  test.each([
    SecretScanningFindingStatus.Resolved,
    SecretScanningFindingStatus.FalsePositive,
    SecretScanningFindingStatus.Ignore
  ])("allows a prompt whose secrets are all reviewed as %s", async (status) => {
    const { service, secretScanningV2Queue, secretScanningV2DAL } = setup({
      findings: [{ fingerprint: "a", status }]
    });

    const result = await submit(service, ["a", "a"]);

    expect(result).toEqual({
      allowed: true,
      onSecretDetected: ClaudeCodeSecretDetectedAction.Block,
      pendingFingerprints: [],
      projectId: PROJECT_ID,
      isScanQueued: false
    });
    expect(secretScanningV2DAL.findings.findStatusesByProjectIdAndFingerprints).toHaveBeenCalledWith(PROJECT_ID, ["a"]);
    expect(secretScanningV2Queue.queueResourceDiffScan).not.toHaveBeenCalled();
  });

  test("allows a secret reviewed for one submitter even if another record of it is unresolved", async () => {
    const { service } = setup({
      findings: [
        { fingerprint: "a", status: SecretScanningFindingStatus.Unresolved },
        { fingerprint: "a", status: SecretScanningFindingStatus.Resolved }
      ]
    });

    expect((await submit(service, ["a"])).allowed).toBe(true);
  });

  test("blocks and queues an encrypted scan when a secret is new", async () => {
    const { service, secretScanningV2Queue } = setup({
      findings: [{ fingerprint: "a", status: SecretScanningFindingStatus.Resolved }]
    });

    const result = await submit(service, ["a", "b"]);

    expect(result).toEqual({
      allowed: false,
      onSecretDetected: ClaudeCodeSecretDetectedAction.Block,
      pendingFingerprints: ["b"],
      projectId: PROJECT_ID,
      isScanQueued: true
    });
    expect(secretScanningV2Queue.queueResourceDiffScan).toHaveBeenCalledTimes(1);

    const [{ payload, dataSourceType, isDiscovered }] = secretScanningV2Queue.queueResourceDiffScan.mock
      .calls[0] as unknown as [{ payload: TClaudeCodePromptSubmission; dataSourceType: string; isDiscovered: boolean }];

    expect(dataSourceType).toBe(SecretScanningDataSource.ClaudeCode);
    expect(isDiscovered).toBe(true);
    expect(payload.submitter).toEqual(submitter);
    expect(payload.excludedFingerprints).toEqual(["a"]);
    expect(payload.cwd).toBe("/repo");
    expect(payload.encryptedPrompt).not.toContain("ghp_test");
    expect(Buffer.from(payload.encryptedPrompt, "base64").toString()).toBe("my token ghp_test");
  });

  test("blocks without a new scan when the secret is already awaiting review", async () => {
    const { service, secretScanningV2Queue } = setup({
      findings: [{ fingerprint: "a", status: SecretScanningFindingStatus.Unresolved }]
    });

    const result = await submit(service, ["a"]);

    expect(result).toEqual({
      allowed: false,
      onSecretDetected: ClaudeCodeSecretDetectedAction.Block,
      pendingFingerprints: ["a"],
      projectId: PROJECT_ID,
      isScanQueued: false
    });
    expect(secretScanningV2Queue.queueResourceDiffScan).not.toHaveBeenCalled();
  });

  test("lets a prompt with a new secret through but still records it when the data source only reports", async () => {
    const { service, secretScanningV2Queue } = setup({
      config: { onSecretDetected: ClaudeCodeSecretDetectedAction.Report }
    });

    const result = await submit(service, ["a"]);

    expect(result).toEqual({
      allowed: true,
      onSecretDetected: ClaudeCodeSecretDetectedAction.Report,
      pendingFingerprints: ["a"],
      projectId: PROJECT_ID,
      isScanQueued: true
    });
    expect(secretScanningV2Queue.queueResourceDiffScan).toHaveBeenCalledTimes(1);
  });

  test("lets a prompt with a secret awaiting review through without a new scan when the data source only reports", async () => {
    const { service, secretScanningV2Queue } = setup({
      config: { onSecretDetected: ClaudeCodeSecretDetectedAction.Report },
      findings: [{ fingerprint: "a", status: SecretScanningFindingStatus.Unresolved }]
    });

    const result = await submit(service, ["a"]);

    expect(result.allowed).toBe(true);
    expect(result.pendingFingerprints).toEqual(["a"]);
    expect(secretScanningV2Queue.queueResourceDiffScan).not.toHaveBeenCalled();
  });

  test("rejects a data source of another type", async () => {
    const { service } = setup({ type: SecretScanningDataSource.GitHub });

    await expect(submit(service, ["a"])).rejects.toBeInstanceOf(BadRequestError);
  });

  test("requires permission to trigger scans", async () => {
    const { service } = setup({ canTriggerScans: false });

    await expect(submit(service, ["a"])).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ClaudeCodeSecretScanningFactory.getDiffScanFindingsPayload", () => {
  const scanFinding = (RuleID: string, Secret: string, StartLine = 1) => ({
    RuleID,
    Secret,
    Description: `${RuleID} detected`,
    StartLine,
    EndLine: StartLine,
    StartColumn: 10,
    EndColumn: 20,
    Entropy: 4.2
  });

  test("records each secret once across lines and rules, skips excluded ones, and never stores the secret", async () => {
    mockScanContentAndGetFindings.mockResolvedValueOnce([
      scanFinding("github-pat", "ghp_test"),
      scanFinding("github-pat", "ghp_test", 3),
      scanFinding("generic-api-key", "ghp_test"),
      scanFinding("stripe-access-token", "sk_test_known"),
      scanFinding("stripe-access-token", "sk_test_new")
    ]);

    const factory = ClaudeCodeSecretScanningFactory({ kmsService, appConnectionDAL: {} } as never);

    const findings = await factory.getDiffScanFindingsPayload({
      dataSource: { projectId: PROJECT_ID } as TClaudeCodeDataSourceWithConnection,
      resourceName: submitter.email,
      configPath: "/tmp/config.toml",
      payload: {
        dataSourceId: DATA_SOURCE_ID,
        submitter,
        encryptedPrompt: Buffer.from("the prompt").toString("base64"),
        excludedFingerprints: [getClaudeCodeFindingFingerprint("sk_test_known")],
        sessionId: "session-1",
        cwd: "/repo",
        submittedAt: "2026-10-24T00:00:00.000Z"
      }
    });

    expect(mockScanContentAndGetFindings).toHaveBeenCalledWith("the prompt", "/tmp/config.toml");
    expect(findings.map(({ fingerprint }) => fingerprint)).toEqual([
      getClaudeCodeFindingFingerprint("ghp_test"),
      getClaudeCodeFindingFingerprint("sk_test_new")
    ]);
    expect(findings[0].details).toMatchObject({
      ruleID: "github-pat",
      startLine: 1,
      author: "jane",
      email: "jane@example.com",
      sessionId: "session-1",
      cwd: "/repo"
    });
    expect(JSON.stringify(findings)).not.toContain("ghp_test");
    expect(JSON.stringify(findings)).not.toContain("sk_test_new");
  });

  test("names each developer's resource by email, keyed by their ID", () => {
    const factory = ClaudeCodeSecretScanningFactory({ kmsService, appConnectionDAL: {} } as never);

    expect(factory.getDiffScanResourcePayload({ submitter } as TClaudeCodePromptSubmission)).toEqual({
      name: "jane@example.com",
      externalId: "user-1"
    });
  });
});
