import { SecretScanningFindingSeverity } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  TFindingsPayload,
  TSecretScanningFactoryFilterDiffScanFindings,
  TSecretScanningFactoryGetDiffScanFindingsPayload,
  TSecretScanningFactoryGetDiffScanNotificationDetails,
  TSecretScanningFactoryGetDiffScanResourcePayload,
  TSecretScanningFactoryGetFullScanPath,
  TSecretScanningFactoryInitialize,
  TSecretScanningFactoryListRawResources,
  TSecretScanningFactoryParams,
  TSecretScanningFactoryPostInitialization,
  TSecretScanningFactorySetupWebhook,
  TSecretScanningFactoryTeardown,
  TSecretScanningFactoryValidateConfigUpdate
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { scanContentAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { createOrgSecretBlindIndexer } from "@app/services/secret-v2-bridge/secret-blind-index-fns";

import { filterClaudeCodeFindingsToRecord } from "./claude-code-secret-scanning-fns";
import {
  TClaudeCodeDataSourceInput,
  TClaudeCodeDataSourceWithConnection,
  TClaudeCodeReportedSecret,
  TQueueClaudeCodeResourceDiffScan
} from "./claude-code-secret-scanning-types";

// Where a value first appears in the prompt, as 1-based lines and columns like the scanner reports.
const findInPrompt = (prompt: string, value: string) => {
  const offset = prompt.indexOf(value);
  if (offset === -1) return null;

  const before = prompt.slice(0, offset);
  const startLine = before.split("\n").length;
  const startColumn = offset - before.lastIndexOf("\n");
  const valueLines = value.split("\n");

  return {
    startLine,
    startColumn,
    endLine: startLine + valueLines.length - 1,
    endColumn: valueLines.length === 1 ? startColumn + value.length - 1 : valueLines[valueLines.length - 1].length
  };
};

// Claude Code has no provider to connect to: the plugin pushes each prompt that holds a secret, and its submitters
// become the data source's resources.
export const ClaudeCodeSecretScanningFactory = ({ kmsService }: TSecretScanningFactoryParams) => {
  const initialize: TSecretScanningFactoryInitialize<TClaudeCodeDataSourceInput> = async (_, callback) => callback({});
  const postInitialization: TSecretScanningFactoryPostInitialization<TClaudeCodeDataSourceInput> = async () => {};
  const teardown: TSecretScanningFactoryTeardown<TClaudeCodeDataSourceWithConnection> = async () => {};
  const listRawResources: TSecretScanningFactoryListRawResources<TClaudeCodeDataSourceWithConnection> = async () => [];
  const setupWebhook: TSecretScanningFactorySetupWebhook<TClaudeCodeDataSourceWithConnection> = async () => undefined;

  const getFullScanPath: TSecretScanningFactoryGetFullScanPath<TClaudeCodeDataSourceWithConnection> = () => {
    throw new Error("Claude Code Data Sources only scan prompts as they are submitted");
  };

  const validateConfigUpdate: TSecretScanningFactoryValidateConfigUpdate<
    TClaudeCodeDataSourceInput["config"],
    TClaudeCodeDataSourceWithConnection
  > = async () => {};

  const getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<
    TQueueClaudeCodeResourceDiffScan["payload"]
  > = (data) => {
    return {
      name: data.submitter.email || data.submitter.name,
      externalId: data.submitter.id
    };
  };

  const getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<
    TClaudeCodeDataSourceWithConnection,
    TQueueClaudeCodeResourceDiffScan["payload"]
  > = async ({ dataSource, payload, configPath }) => {
    const { orgId, submissionId, encryptedPrompt, encryptedReportedSecrets, submitter, sessionId, cwd, submittedAt } =
      payload;

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: dataSource.projectId
    });

    const prompt = decryptor({ cipherTextBlob: Buffer.from(encryptedPrompt, "base64") }).toString();

    const findings = await scanContentAndGetFindings(prompt, configPath);

    // Generated the same way as secrets_v2.secretValueOrgBlindIndex, so a finding can later be matched against stored
    // secrets without decrypting either.
    const blindIndexer = await createOrgSecretBlindIndexer({ orgId, kmsService });

    const findingsPayload = new Map<string, TFindingsPayload[number]>();

    const addFinding = async (finding: {
      secret: string;
      ruleId: string;
      description: string;
      startLine: number;
      endLine: number;
      startColumn: number;
      endColumn: number;
      entropy: number;
    }) => {
      const secretFindingBlindIndex = await blindIndexer.generateOrgLevelBlindIndex(Buffer.from(finding.secret));

      // a secret repeated in one prompt, or matched by several rules, is one finding. Whether it is recorded at all is
      // decided when it is saved, by filterDiffScanFindings.
      if (findingsPayload.has(secretFindingBlindIndex)) return;

      // like a git finding, identified by where it is: the prompt, the rule, and the position in the prompt
      const fingerprint = `${submissionId}:${finding.ruleId}:${finding.startLine}:${finding.startColumn}`;

      findingsPayload.set(secretFindingBlindIndex, {
        fingerprint,
        secretFindingBlindIndex,
        // kept for features that need the value later; the API never returns it
        encryptedSecretValue: encryptor({ plainText: Buffer.from(finding.secret) }).cipherTextBlob,
        severity: SecretScanningFindingSeverity.High,
        rule: finding.ruleId,
        details: {
          description: finding.description,
          ruleID: finding.ruleId,
          startLine: finding.startLine,
          endLine: finding.endLine,
          startColumn: finding.startColumn,
          endColumn: finding.endColumn,
          entropy: finding.entropy,
          author: submitter.name,
          email: submitter.email ?? "",
          date: submittedAt,
          fingerprint,
          sessionId,
          cwd
        }
      });
    };

    for await (const finding of findings) {
      await addFinding({
        secret: finding.Secret,
        ruleId: finding.RuleID,
        description: finding.Description,
        startLine: finding.StartLine,
        endLine: finding.EndLine,
        startColumn: finding.StartColumn,
        endColumn: finding.EndColumn,
        entropy: finding.Entropy
      });
    }

    // The plugin blocks on its own scan, which can find secrets this one doesn't: it can run another CLI version, and
    // it scans the prompt from stdin while this scans a file, so path-based rules differ. Each new secret it reported
    // is recorded too, so a blocked secret always has a finding to review. Only values that really are in the prompt.
    const reportedSecrets: TClaudeCodeReportedSecret[] = encryptedReportedSecrets
      ? (JSON.parse(
          decryptor({ cipherTextBlob: Buffer.from(encryptedReportedSecrets, "base64") }).toString()
        ) as TClaudeCodeReportedSecret[])
      : [];

    for (const { value, ruleId } of reportedSecrets) {
      const location = findInPrompt(prompt, value);
      // eslint-disable-next-line no-continue
      if (!location) continue;

      // eslint-disable-next-line no-await-in-loop
      await addFinding({
        secret: value,
        ruleId,
        description: "Detected by the Claude Code plugin's scan",
        ...location,
        entropy: 0
      });
    }

    return { findings: [...findingsPayload.values()] };
  };

  const filterDiffScanFindings: TSecretScanningFactoryFilterDiffScanFindings<TClaudeCodeDataSourceWithConnection> = ({
    dataSource,
    findings,
    secretScanningV2DAL,
    tx
  }) => filterClaudeCodeFindingsToRecord({ secretScanningV2DAL, projectId: dataSource.projectId, findings, tx });

  // Jobs queued before isPromptBlocked was added have none, and are treated as blocked, the default.
  const getDiffScanNotificationDetails: TSecretScanningFactoryGetDiffScanNotificationDetails<
    TQueueClaudeCodeResourceDiffScan["payload"]
  > = ({ isPromptBlocked }) => ({ isPromptScan: true, isPromptBlocked: isPromptBlocked ?? true });

  return {
    initialize,
    postInitialization,
    listRawResources,
    getFullScanPath,
    getDiffScanResourcePayload,
    getDiffScanFindingsPayload,
    filterDiffScanFindings,
    getDiffScanNotificationDetails,
    teardown,
    setupWebhook,
    validateConfigUpdate
  };
};
