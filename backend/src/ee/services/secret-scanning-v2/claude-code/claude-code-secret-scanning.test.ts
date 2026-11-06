import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { createHash } from "crypto";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { ClaudeCodeSecretDetectedAction, ClaudeCodeSecretStatus } from "./claude-code-secret-scanning-enums";
import { ClaudeCodeSecretScanningFactory } from "./claude-code-secret-scanning-factory";
import { filterClaudeCodeFindingsToRecord } from "./claude-code-secret-scanning-fns";
import { claudeCodeSecretScanningService } from "./claude-code-secret-scanning-service";
import { TClaudeCodeDataSourceWithConnection, TClaudeCodePromptSubmission } from "./claude-code-secret-scanning-types";

const mockScanContentAndGetFindings = vi.fn<(content: string, configPath?: string) => Promise<unknown[]>>();

vi.mock("@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns", () => ({
  scanContentAndGetFindings: (content: string, configPath?: string) =>
    mockScanContentAndGetFindings(content, configPath)
}));

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const DATA_SOURCE_ID = "6f1c1c2e-8a4b-4f0e-9a51-0b8d7d3f1e2a";

// a stand-in for the org data key's HMAC
const blindIndexOf = (value: string) => createHash("sha256").update(`org-key:${value}`).digest("hex");

// encryption is reversible base64 here, so the queued payload can be checked
const kmsService = {
  createCipherPairWithDataKey: vi.fn(async () => ({
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: Buffer.from(plainText) }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => Buffer.from(cipherTextBlob),
    generateSecretBlindIndex: async (value: Buffer) => blindIndexOf(value.toString())
  }))
};

const actor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: null,
  orgId: ORG_ID,
  rootOrgId: ORG_ID,
  parentOrgId: ORG_ID
};

const submitter = { id: "user-1", name: "jane", email: "jane@example.com" };

// findings are listed oldest first, as they were recorded
const setup = ({
  findings = [] as { value: string; status: string }[],
  type = SecretScanningDataSource.ClaudeCode,
  canTriggerScans = true,
  config = {} as Record<string, unknown>,
  isScanQueued = true
} = {}) => {
  const secretScanningV2DAL = {
    primaryNode: vi.fn(() => "primary"),
    dataSources: {
      findById: vi.fn(async () => ({ id: DATA_SOURCE_ID, name: "claude-code", projectId: PROJECT_ID, type, config }))
    },
    findings: {
      // like the query, only the newest finding of each secret
      findNewestStatusesByProjectIdAndBlindIndexes: vi.fn(async (_projectId: string, blindIndexes: string[]) => {
        const newest = new Map<string, string>();
        for (const { value, status } of findings) newest.set(blindIndexOf(value), status);
        return [...newest]
          .filter(([secretFindingBlindIndex]) => blindIndexes.includes(secretFindingBlindIndex))
          .map(([secretFindingBlindIndex, status]) => ({ secretFindingBlindIndex, status }));
      })
    }
  };
  const secretScanningV2Queue = { queueResourceDiffScan: vi.fn(async () => isScanQueued) };

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
    permissionService: { getProjectPermission: vi.fn(async () => ({ permission })) } as never
  });

  return { service, secretScanningV2DAL, secretScanningV2Queue };
};

const secretsOf = (...values: string[]) => values.map((value) => ({ value, ruleId: `rule-${value}` }));

const check = (service: ReturnType<typeof setup>["service"], ...values: string[]) =>
  service.checkSecrets({ dataSourceId: DATA_SOURCE_ID, secrets: secretsOf(...values) }, actor as never);

const submit = (service: ReturnType<typeof setup>["service"], ...values: string[]) =>
  service.submitPrompt(
    {
      dataSourceId: DATA_SOURCE_ID,
      prompt: `my secrets: ${values.join(" ")}`,
      secrets: secretsOf(...values),
      submitter,
      cwd: "/repo"
    },
    actor as never
  );

describe("claudeCodeSecretScanningService.checkSecrets", () => {
  test("returns a status per secret, in order, without secret values or blind indexes", async () => {
    const { service } = setup({
      findings: [
        { value: "reviewed", status: SecretScanningFindingStatus.FalsePositive },
        { value: "open", status: SecretScanningFindingStatus.Unresolved }
      ]
    });

    const result = await check(service, "new", "reviewed", "open");

    expect(result).toEqual({
      allowed: false,
      promptRequired: true,
      onSecretDetected: ClaudeCodeSecretDetectedAction.Block,
      secrets: [
        { ruleId: "rule-new", status: ClaudeCodeSecretStatus.NewFinding },
        { ruleId: "rule-reviewed", status: ClaudeCodeSecretStatus.Allowed },
        { ruleId: "rule-open", status: ClaudeCodeSecretStatus.PendingResolution }
      ],
      projectId: PROJECT_ID
    });
    expect(JSON.stringify(result)).not.toContain(blindIndexOf("reviewed"));
  });

  test.each([SecretScanningFindingStatus.FalsePositive, SecretScanningFindingStatus.Ignore])(
    "allows a secret whose newest finding is %s, without asking for the prompt",
    async (status) => {
      const { service } = setup({ findings: [{ value: "a", status }] });

      const result = await check(service, "a");

      expect(result).toMatchObject({ allowed: true, promptRequired: false });
      expect(result.secrets[0].status).toBe(ClaudeCodeSecretStatus.Allowed);
    }
  );

  test("blocks a resolved secret that comes back and asks for the prompt to record it as a new finding", async () => {
    const { service } = setup({ findings: [{ value: "a", status: SecretScanningFindingStatus.Resolved }] });

    const result = await check(service, "a");

    expect(result).toMatchObject({ allowed: false, promptRequired: true });
    expect(result.secrets[0].status).toBe(ClaudeCodeSecretStatus.NewFinding);
  });

  test("blocks a secret still waiting for review without asking for the prompt again", async () => {
    const { service } = setup({ findings: [{ value: "a", status: SecretScanningFindingStatus.Unresolved }] });

    const result = await check(service, "a");

    expect(result).toMatchObject({ allowed: false, promptRequired: false });
    expect(result.secrets[0].status).toBe(ClaudeCodeSecretStatus.PendingResolution);
  });

  test("decides by the newest finding of a secret", async () => {
    const { service } = setup({
      findings: [
        { value: "accepted-after-resolve", status: SecretScanningFindingStatus.Resolved },
        { value: "resolved-after-accept", status: SecretScanningFindingStatus.Ignore },
        { value: "accepted-after-resolve", status: SecretScanningFindingStatus.FalsePositive },
        { value: "resolved-after-accept", status: SecretScanningFindingStatus.Resolved }
      ]
    });

    const result = await check(service, "accepted-after-resolve", "resolved-after-accept");

    expect(result.secrets.map(({ status }) => status)).toEqual([
      ClaudeCodeSecretStatus.Allowed,
      ClaudeCodeSecretStatus.NewFinding
    ]);
  });

  test("lets every prompt through when the data source only reports, but still flags secrets", async () => {
    const { service } = setup({
      config: { onSecretDetected: ClaudeCodeSecretDetectedAction.Report },
      findings: [
        { value: "open", status: SecretScanningFindingStatus.Unresolved },
        { value: "resolved", status: SecretScanningFindingStatus.Resolved },
        { value: "ignored", status: SecretScanningFindingStatus.Ignore }
      ]
    });

    const result = await check(service, "new", "open", "resolved", "ignored");

    expect(result).toMatchObject({ allowed: true, promptRequired: true });
    expect(result.secrets.map(({ status }) => status)).toEqual([
      ClaudeCodeSecretStatus.NewFinding,
      ClaudeCodeSecretStatus.PendingResolution,
      ClaudeCodeSecretStatus.NewFinding,
      ClaudeCodeSecretStatus.Allowed
    ]);
  });

  test("reads the data source from the primary, so a switch to blocking applies at once", async () => {
    const { service, secretScanningV2DAL } = setup();

    await check(service, "a");

    expect(secretScanningV2DAL.dataSources.findById).toHaveBeenCalledWith(DATA_SOURCE_ID, "primary");
  });

  test("rejects a data source of another type", async () => {
    const { service } = setup({ type: SecretScanningDataSource.GitHub });

    await expect(check(service, "a")).rejects.toBeInstanceOf(BadRequestError);
  });

  test("requires permission to trigger scans", async () => {
    const { service } = setup({ canTriggerScans: false });

    await expect(check(service, "a")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("claudeCodeSecretScanningService.submitPrompt", () => {
  test("queues an encrypted scan of the prompt when a secret is new", async () => {
    const { service, secretScanningV2Queue } = setup({
      findings: [
        { value: "known", status: SecretScanningFindingStatus.Unresolved },
        { value: "accepted", status: SecretScanningFindingStatus.Ignore },
        { value: "resolved", status: SecretScanningFindingStatus.Resolved }
      ]
    });

    expect(await submit(service, "new", "known", "accepted", "resolved")).toEqual({
      projectId: PROJECT_ID,
      dataSourceName: "claude-code",
      isScanQueued: true
    });
    expect(secretScanningV2Queue.queueResourceDiffScan).toHaveBeenCalledTimes(1);

    const [{ payload, dataSourceType, isDiscovered }] = secretScanningV2Queue.queueResourceDiffScan.mock
      .calls[0] as unknown as [{ payload: TClaudeCodePromptSubmission; dataSourceType: string; isDiscovered: boolean }];

    expect(dataSourceType).toBe(SecretScanningDataSource.ClaudeCode);
    expect(isDiscovered).toBe(true);
    expect(payload.orgId).toBe(ORG_ID);
    expect(payload.submitter).toEqual(submitter);
    expect(payload.encryptedPrompt).not.toContain("known");
    expect(Buffer.from(payload.encryptedPrompt, "base64").toString()).toBe("my secrets: new known accepted resolved");
    expect(payload.isPromptBlocked).toBe(true);
    // only the new and resurfaced secrets, encrypted
    expect(JSON.parse(Buffer.from(payload.encryptedReportedSecrets!, "base64").toString())).toEqual(
      secretsOf("new", "resolved")
    );
  });

  test("records that the prompt was let through when the data source only reports", async () => {
    const { service, secretScanningV2Queue } = setup({
      config: { onSecretDetected: ClaudeCodeSecretDetectedAction.Report }
    });

    await submit(service, "new");

    const [{ payload }] = secretScanningV2Queue.queueResourceDiffScan.mock.calls[0] as unknown as [
      { payload: TClaudeCodePromptSubmission }
    ];
    expect(payload.isPromptBlocked).toBe(false);
  });

  test("queues nothing when no secret is new", async () => {
    const { service, secretScanningV2Queue } = setup({
      findings: [{ value: "known", status: SecretScanningFindingStatus.Unresolved }]
    });

    expect(await submit(service, "known")).toEqual({
      projectId: PROJECT_ID,
      dataSourceName: "claude-code",
      isScanQueued: false
    });
    expect(secretScanningV2Queue.queueResourceDiffScan).not.toHaveBeenCalled();
  });

  test("fails when the scan cannot be queued, so the plugin blocks the prompt", async () => {
    const { service } = setup({ isScanQueued: false });

    await expect(submit(service, "new")).rejects.toBeInstanceOf(InternalServerError);
  });
});

describe("ClaudeCodeSecretScanningFactory.getDiffScanFindingsPayload", () => {
  const scanFinding = (RuleID: string, Secret: string, StartLine = 1, StartColumn = 10) => ({
    RuleID,
    Secret,
    Description: `${RuleID} detected`,
    StartLine,
    EndLine: StartLine,
    StartColumn,
    EndColumn: StartColumn + 10,
    Entropy: 4.2
  });

  test("records each secret once with its blind index, its encrypted value and a location fingerprint", async () => {
    mockScanContentAndGetFindings.mockResolvedValueOnce([
      scanFinding("github-pat", "ghp_test"),
      scanFinding("github-pat", "ghp_test", 3),
      scanFinding("generic-api-key", "ghp_test", 1, 12),
      scanFinding("stripe-access-token", "sk_test_new", 2, 5)
    ]);

    const factory = ClaudeCodeSecretScanningFactory({ kmsService, appConnectionDAL: {} } as never);

    const { findings } = await factory.getDiffScanFindingsPayload({
      dataSource: { projectId: PROJECT_ID } as TClaudeCodeDataSourceWithConnection,
      resourceName: submitter.email,
      configPath: "/tmp/config.toml",
      payload: {
        dataSourceId: DATA_SOURCE_ID,
        orgId: ORG_ID,
        submissionId: "submission-1",
        submitter,
        encryptedPrompt: Buffer.from("the prompt").toString("base64"),
        sessionId: "session-1",
        cwd: "/repo",
        submittedAt: "2026-10-24T00:00:00.000Z"
      }
    });

    expect(mockScanContentAndGetFindings).toHaveBeenCalledWith("the prompt", "/tmp/config.toml");
    expect(
      findings.map(({ fingerprint, secretFindingBlindIndex }) => ({ fingerprint, secretFindingBlindIndex }))
    ).toEqual([
      { fingerprint: "submission-1:github-pat:1:10", secretFindingBlindIndex: blindIndexOf("ghp_test") },
      { fingerprint: "submission-1:stripe-access-token:2:5", secretFindingBlindIndex: blindIndexOf("sk_test_new") }
    ]);
    expect(findings[0].details).toMatchObject({
      ruleID: "github-pat",
      author: "jane",
      email: "jane@example.com",
      fingerprint: "submission-1:github-pat:1:10",
      sessionId: "session-1",
      cwd: "/repo"
    });
    expect(findings[0].encryptedSecretValue?.toString()).toBe("ghp_test");
    expect(JSON.stringify(findings.map(({ encryptedSecretValue, ...rest }) => rest))).not.toContain("ghp_test");
    expect(JSON.stringify(findings.map(({ encryptedSecretValue, ...rest }) => rest))).not.toContain("sk_test_new");
  });

  test("records a reported secret that the server's scan missed, located in the prompt", async () => {
    mockScanContentAndGetFindings.mockResolvedValueOnce([scanFinding("github-pat", "ghp_test")]);

    const factory = ClaudeCodeSecretScanningFactory({ kmsService, appConnectionDAL: {} } as never);
    const encrypt = (value: string) => Buffer.from(value).toString("base64");

    const { findings } = await factory.getDiffScanFindingsPayload({
      dataSource: { projectId: PROJECT_ID } as TClaudeCodeDataSourceWithConnection,
      resourceName: submitter.email,
      payload: {
        dataSourceId: DATA_SOURCE_ID,
        orgId: ORG_ID,
        submissionId: "submission-1",
        submitter,
        encryptedPrompt: encrypt("token ghp_test\nkey: sk_live_missed"),
        encryptedReportedSecrets: encrypt(
          JSON.stringify([
            { value: "ghp_test", ruleId: "github-pat" },
            { value: "sk_live_missed", ruleId: "stripe-access-token" },
            { value: "not_in_the_prompt", ruleId: "generic-api-key" }
          ])
        ),
        submittedAt: "2026-10-24T00:00:00.000Z"
      }
    });

    expect(
      findings.map(({ fingerprint, secretFindingBlindIndex }) => ({ fingerprint, secretFindingBlindIndex }))
    ).toEqual([
      { fingerprint: "submission-1:github-pat:1:10", secretFindingBlindIndex: blindIndexOf("ghp_test") },
      { fingerprint: "submission-1:stripe-access-token:2:6", secretFindingBlindIndex: blindIndexOf("sk_live_missed") }
    ]);
    expect(findings[1].details).toMatchObject({ startLine: 2, endLine: 2, startColumn: 6, endColumn: 19 });
    expect(findings[1].encryptedSecretValue?.toString()).toBe("sk_live_missed");
  });

  test("passes on whether the prompt was blocked, and treats jobs queued without it as blocked", () => {
    const factory = ClaudeCodeSecretScanningFactory({ kmsService, appConnectionDAL: {} } as never);

    expect(factory.getDiffScanNotificationDetails?.({ isPromptBlocked: false } as TClaudeCodePromptSubmission)).toEqual(
      { isPromptScan: true, isPromptBlocked: false }
    );
    expect(factory.getDiffScanNotificationDetails?.({} as TClaudeCodePromptSubmission)).toEqual({
      isPromptScan: true,
      isPromptBlocked: true
    });
  });

  test("names each developer's resource by email, keyed by their ID", () => {
    const factory = ClaudeCodeSecretScanningFactory({ kmsService, appConnectionDAL: {} } as never);

    expect(factory.getDiffScanResourcePayload({ submitter } as TClaudeCodePromptSubmission)).toEqual({
      name: "jane@example.com",
      externalId: "user-1"
    });
  });
});

describe("filterClaudeCodeFindingsToRecord", () => {
  const findingOf = (value: string | null, fingerprint = `fp-${value}`) => ({
    resourceName: submitter.email,
    ruleId: "rule",
    fingerprint,
    severity: "high",
    details: {},
    secretFindingBlindIndex: value === null ? null : blindIndexOf(value),
    encryptedSecretValue: null
  });

  test("keeps only new and resolved secrets, decided when the findings are saved", async () => {
    const { secretScanningV2DAL } = setup({
      findings: [
        { value: "open", status: SecretScanningFindingStatus.Unresolved },
        { value: "accepted", status: SecretScanningFindingStatus.FalsePositive },
        { value: "ignored", status: SecretScanningFindingStatus.Ignore },
        { value: "resolved", status: SecretScanningFindingStatus.Resolved }
      ]
    });
    const tx = { raw: vi.fn(async () => {}) };

    const kept = await filterClaudeCodeFindingsToRecord({
      secretScanningV2DAL: secretScanningV2DAL as never,
      projectId: PROJECT_ID,
      findings: ["new", "open", "accepted", "ignored", "resolved", null].map((value) => findingOf(value)) as never,
      tx: tx as never
    });

    expect(kept.map(({ fingerprint }) => fingerprint)).toEqual(["fp-new", "fp-resolved", "fp-null"]);
    expect(secretScanningV2DAL.findings.findNewestStatusesByProjectIdAndBlindIndexes).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.any(Array),
      tx
    );
  });

  test("locks the project before it reads the findings", async () => {
    const { secretScanningV2DAL } = setup();
    const tx = { raw: vi.fn(async () => {}) };

    await filterClaudeCodeFindingsToRecord({
      secretScanningV2DAL: secretScanningV2DAL as never,
      projectId: PROJECT_ID,
      findings: [findingOf("b", "fp-1"), findingOf("a", "fp-2")] as never,
      tx: tx as never
    });

    expect(tx.raw).toHaveBeenCalledTimes(1);
    expect(tx.raw).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(?)", [
      PgSqlLock.RecordClaudeCodeFindings(PROJECT_ID)
    ]);
    expect(tx.raw.mock.invocationCallOrder[0]).toBeLessThan(
      secretScanningV2DAL.findings.findNewestStatusesByProjectIdAndBlindIndexes.mock.invocationCallOrder[0]
    );
  });

  test("takes no lock and reads nothing when no finding has a blind index", async () => {
    const { secretScanningV2DAL } = setup();
    const tx = { raw: vi.fn(async () => {}) };

    const findings = [findingOf(null)];
    const kept = await filterClaudeCodeFindingsToRecord({
      secretScanningV2DAL: secretScanningV2DAL as never,
      projectId: PROJECT_ID,
      findings: findings as never,
      tx: tx as never
    });

    expect(kept).toEqual(findings);
    expect(tx.raw).not.toHaveBeenCalled();
    expect(secretScanningV2DAL.findings.findNewestStatusesByProjectIdAndBlindIndexes).not.toHaveBeenCalled();
  });
});
