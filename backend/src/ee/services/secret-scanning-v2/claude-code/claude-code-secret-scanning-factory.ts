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
import { createOrgSecretBlindIndexer } from "@app/services/secret-v2-bridge/secret-blind-index-fns";

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
    const { orgId, submissionId, encryptedPrompt, excludedBlindIndexes, submitter, sessionId, cwd, submittedAt } =
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

    const excluded = new Set(excludedBlindIndexes);
    const findingsPayload = new Map<string, TFindingsPayload[number]>();

    for (const finding of findings) {
      // eslint-disable-next-line no-await-in-loop
      const secretFindingBlindIndex = await blindIndexer.generateOrgLevelBlindIndex(Buffer.from(finding.Secret));

      // a secret repeated in one prompt, or matched by several rules, is one finding
      // eslint-disable-next-line no-continue
      if (excluded.has(secretFindingBlindIndex) || findingsPayload.has(secretFindingBlindIndex)) continue;

      // like a git finding, identified by where it is: the prompt, the rule, and the position in the prompt
      const fingerprint = `${submissionId}:${finding.RuleID}:${finding.StartLine}:${finding.StartColumn}`;

      findingsPayload.set(secretFindingBlindIndex, {
        fingerprint,
        secretFindingBlindIndex,
        // kept for matching against stored secrets later; the API never returns it
        encryptedSecretValue: encryptor({ plainText: Buffer.from(finding.Secret) }).cipherTextBlob,
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
