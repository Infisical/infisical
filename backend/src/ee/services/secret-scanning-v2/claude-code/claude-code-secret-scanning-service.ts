import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { createOrgSecretBlindIndexer } from "@app/services/secret-v2-bridge/secret-blind-index-fns";

import { ClaudeCodeSecretDetectedAction, ClaudeCodeSecretStatus } from "./claude-code-secret-scanning-enums";
import { ClaudeCodeDataSourceConfigSchema } from "./claude-code-secret-scanning-schemas";
import {
  TCheckClaudeCodeSecretsDTO,
  TClaudeCodePromptSubmission,
  TSubmitClaudeCodePromptDTO
} from "./claude-code-secret-scanning-types";

type TClaudeCodeSecretScanningServiceDep = {
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "queueResourceDiffScan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

// What a secret's newest finding means for a prompt that holds it. A reviewer accepts a secret by marking it a false
// positive or ignoring it, so it is never reported again. Resolved means the secret was dealt with, usually revoked
// or rotated, so seeing it again is a new incident and it is recorded as a new finding.
const getSecretStatus = (newestFindingStatus: string | undefined) => {
  switch (newestFindingStatus) {
    case undefined:
    case SecretScanningFindingStatus.Resolved:
      return ClaudeCodeSecretStatus.NewFinding;
    case SecretScanningFindingStatus.FalsePositive:
    case SecretScanningFindingStatus.Ignore:
      return ClaudeCodeSecretStatus.Allowed;
    default:
      return ClaudeCodeSecretStatus.PendingResolution;
  }
};

export const claudeCodeSecretScanningService = ({
  secretScanningV2DAL,
  secretScanningV2Queue,
  kmsService,
  permissionService,
  licenseService
}: TClaudeCodeSecretScanningServiceDep) => {
  const $getClaudeCodeDataSource = async (dataSourceId: string, actor: OrgServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message: "Failed to check Claude Code prompt due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find Claude Code Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.TriggerScans,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (dataSource.type !== SecretScanningDataSource.ClaudeCode)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for Claude Code`
      });

    return { dataSource, config: ClaudeCodeDataSourceConfigSchema.parse(dataSource.config ?? {}) };
  };

  // Matches each secret to the project's findings by blind index, so nothing is decrypted to compare. The blind
  // indexes stay internal: callers return only the statuses.
  const $classifySecrets = async ({
    secrets,
    projectId,
    actor
  }: {
    secrets: TCheckClaudeCodeSecretsDTO["secrets"];
    projectId: string;
    actor: OrgServiceActor;
  }) => {
    const blindIndexer = await createOrgSecretBlindIndexer({ orgId: actor.orgId, kmsService });

    const blindIndexes = await Promise.all(
      secrets.map(({ value }) => blindIndexer.generateOrgLevelBlindIndex(Buffer.from(value)))
    );

    // Only the newest finding of each secret decides, whoever submitted it.
    const newestFindings = await secretScanningV2DAL.findings.findNewestStatusesByProjectIdAndBlindIndexes(projectId, [
      ...new Set(blindIndexes)
    ]);
    const newestStatusByBlindIndex = new Map(
      newestFindings.map((finding) => [finding.secretFindingBlindIndex, finding.status])
    );

    return secrets.map(({ ruleId }, index) => {
      const blindIndex = blindIndexes[index];
      return { ruleId, status: getSecretStatus(newestStatusByBlindIndex.get(blindIndex)), blindIndex };
    });
  };

  // The plugin calls this with the secrets its local scan found, before it sends anything else. It sends the prompt
  // only when this asks for it, so a prompt whose secrets are all known never leaves the developer's machine.
  const checkSecrets = async ({ dataSourceId, secrets }: TCheckClaudeCodeSecretsDTO, actor: OrgServiceActor) => {
    const { dataSource, config } = await $getClaudeCodeDataSource(dataSourceId, actor);

    const classified = await $classifySecrets({ secrets, projectId: dataSource.projectId, actor });

    return {
      allowed:
        config.onSecretDetected === ClaudeCodeSecretDetectedAction.Report ||
        classified.every(({ status }) => status === ClaudeCodeSecretStatus.Allowed),
      // a new or resurfaced secret needs the prompt, so it can be scanned and recorded as a finding
      promptRequired: classified.some(({ status }) => status === ClaudeCodeSecretStatus.NewFinding),
      onSecretDetected: config.onSecretDetected,
      secrets: classified.map(({ ruleId, status }) => ({ ruleId, status })),
      projectId: dataSource.projectId
    };
  };

  // The plugin sends the prompt only when a check asked for it. It is scanned in the background with the project's
  // config, and its new and resurfaced secrets are recorded as findings for review.
  const submitPrompt = async (
    { dataSourceId, prompt, secrets, submitter, sessionId, cwd }: TSubmitClaudeCodePromptDTO,
    actor: OrgServiceActor
  ) => {
    const { dataSource } = await $getClaudeCodeDataSource(dataSourceId, actor);

    const classified = await $classifySecrets({ secrets, projectId: dataSource.projectId, actor });

    // Secrets whose newest finding still stands are not recorded again, so resubmitting a prompt adds nothing.
    if (classified.every(({ status }) => status !== ClaudeCodeSecretStatus.NewFinding)) {
      return { projectId: dataSource.projectId, isScanQueued: false };
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: dataSource.projectId
    });

    const payload: TClaudeCodePromptSubmission = {
      dataSourceId,
      orgId: actor.orgId,
      submissionId: crypto.nativeCrypto.randomUUID(),
      submitter,
      encryptedPrompt: encryptor({ plainText: Buffer.from(prompt) }).cipherTextBlob.toString("base64"),
      // Secrets whose newest finding is open or accepted are left out, so they aren't recorded again under this
      // submitter. Resolved secrets are not in this list: finding them again is a new finding.
      excludedBlindIndexes: [
        ...new Set(
          classified
            .filter(({ status }) => status !== ClaudeCodeSecretStatus.NewFinding)
            .map(({ blindIndex }) => blindIndex)
        )
      ],
      sessionId,
      cwd,
      submittedAt: new Date().toISOString()
    };

    await secretScanningV2Queue.queueResourceDiffScan({
      dataSourceType: SecretScanningDataSource.ClaudeCode,
      dataSourceId,
      payload,
      isDiscovered: true
    });

    return { projectId: dataSource.projectId, isScanQueued: true };
  };

  return {
    checkSecrets,
    submitPrompt
  };
};
