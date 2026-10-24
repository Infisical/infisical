import { scanContentAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretScanningFindingSeverity } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  TFindingsPayload,
  TSecretScanningFactoryGetDiffScanFindingsPayload,
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
import { KmsDataKey } from "@app/services/kms/kms-types";

import { getClaudeCodeFindingFingerprint } from "./claude-code-secret-scanning-fns";
import {
  TClaudeCodeDataSourceInput,
  TClaudeCodeDataSourceWithConnection,
  TQueueClaudeCodeResourceDiffScan
} from "./claude-code-secret-scanning-types";

// Claude Code has no provider to connect to: the plugin pushes each prompt that holds a secret, and its submitters
// become the data source's resources.
export const ClaudeCodeSecretScanningFactory = ({ kmsService }: TSecretScanningFactoryParams) => {
  const initialize: TSecretScanningFactoryInitialize<TClaudeCodeDataSourceInput> = async (_, callback) => callback({});

  const postInitialization: TSecretScanningFactoryPostInitialization<TClaudeCodeDataSourceInput> = async () => {};

  const teardown: TSecretScanningFactoryTeardown<TClaudeCodeDataSourceWithConnection> = async () => {};

  const listRawResources: TSecretScanningFactoryListRawResources<TClaudeCodeDataSourceWithConnection> = async () => [];

  const getFullScanPath: TSecretScanningFactoryGetFullScanPath<TClaudeCodeDataSourceWithConnection> = async () => {
    throw new Error("Claude Code Data Sources only scan prompts as they are submitted");
  };

  const setupWebhook: TSecretScanningFactorySetupWebhook<TClaudeCodeDataSourceWithConnection> = async () => undefined;

  const validateConfigUpdate: TSecretScanningFactoryValidateConfigUpdate<
    TClaudeCodeDataSourceInput["config"],
    TClaudeCodeDataSourceWithConnection
  > = async () => {};

  const getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<
    TQueueClaudeCodeResourceDiffScan["payload"]
  > = ({ submitter }) => ({
    name: submitter.email || submitter.name,
    externalId: submitter.id
  });

  const getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<
    TClaudeCodeDataSourceWithConnection,
    TQueueClaudeCodeResourceDiffScan["payload"]
  > = async ({ dataSource, payload, configPath }) => {
    const { encryptedPrompt, excludedFingerprints, submitter, sessionId, cwd, submittedAt } = payload;

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: dataSource.projectId
    });

    const prompt = decryptor({ cipherTextBlob: Buffer.from(encryptedPrompt, "base64") }).toString();

    const findings = await scanContentAndGetFindings(prompt, configPath);

    const excluded = new Set(excludedFingerprints);
    const findingsPayload = new Map<string, TFindingsPayload[number]>();

    for (const finding of findings) {
      const fingerprint = getClaudeCodeFindingFingerprint(finding.Secret);

      // a secret repeated in one prompt, or matched by several rules, is one finding; upserting it twice in one statement fails
      // eslint-disable-next-line no-continue
      if (excluded.has(fingerprint) || findingsPayload.has(fingerprint)) continue;

      findingsPayload.set(fingerprint, {
        fingerprint,
        severity: SecretScanningFindingSeverity.High,
        rule: finding.RuleID,
        details: {
          description: finding.Description,
          ruleID: finding.RuleID,
          startLine: finding.StartLine,
          endLine: finding.EndLine,
          startColumn: finding.StartColumn,
          endColumn: finding.EndColumn,
          entropy: finding.Entropy,
          author: submitter.name,
          email: submitter.email ?? "",
          date: submittedAt,
          fingerprint,
          sessionId,
          cwd
        }
      });
    }

    return [...findingsPayload.values()];
  };

  return {
    initialize,
    postInitialization,
    listRawResources,
    getFullScanPath,
    getDiffScanResourcePayload,
    getDiffScanFindingsPayload,
    teardown,
    setupWebhook,
    validateConfigUpdate
  };
};
