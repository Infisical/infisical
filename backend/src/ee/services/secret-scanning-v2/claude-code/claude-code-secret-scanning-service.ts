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
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { ClaudeCodeSecretDetectedAction } from "./claude-code-secret-scanning-enums";
import { ClaudeCodeDataSourceConfigSchema } from "./claude-code-secret-scanning-schemas";
import { TClaudeCodePromptSubmission, TSubmitClaudeCodePromptDTO } from "./claude-code-secret-scanning-types";

// A reviewer closing out a finding with any of these lets prompts holding that secret through.
const ALLOWED_FINDING_STATUSES = new Set<string>([
  SecretScanningFindingStatus.Resolved,
  SecretScanningFindingStatus.FalsePositive,
  SecretScanningFindingStatus.Ignore
]);

type TClaudeCodeSecretScanningServiceDep = {
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "queueResourceDiffScan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export const claudeCodeSecretScanningService = ({
  secretScanningV2DAL,
  secretScanningV2Queue,
  kmsService,
  permissionService,
  licenseService
}: TClaudeCodeSecretScanningServiceDep) => {
  // The plugin only submits prompts its local scan flagged. A prompt is allowed once every secret in it has been
  // reviewed in the project, or right away if the data source only reports; new secrets are scanned in the background
  // and recorded as findings for review.
  const submitPrompt = async (
    { dataSourceId, prompt, fingerprints, submitter, sessionId, cwd }: TSubmitClaudeCodePromptDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message: "Failed to submit Claude Code prompt due to plan restriction. Upgrade plan to enable Secret Scanning."
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

    const { onSecretDetected } = ClaudeCodeDataSourceConfigSchema.parse(dataSource.config ?? {});
    const isReportOnly = onSecretDetected === ClaudeCodeSecretDetectedAction.Report;

    const uniqueFingerprints = [...new Set(fingerprints)];

    const findings = await secretScanningV2DAL.findings.findStatusesByProjectIdAndFingerprints(
      dataSource.projectId,
      uniqueFingerprints
    );

    // The same secret can be recorded once per submitter; a review of any of those records covers it.
    const knownFingerprints = new Set(findings.map((finding) => finding.fingerprint));
    const reviewedFingerprints = new Set(
      findings.filter((finding) => ALLOWED_FINDING_STATUSES.has(finding.status)).map((finding) => finding.fingerprint)
    );

    const pendingFingerprints = uniqueFingerprints.filter((fingerprint) => !reviewedFingerprints.has(fingerprint));

    if (!pendingFingerprints.length) {
      return {
        allowed: true,
        onSecretDetected,
        pendingFingerprints,
        projectId: dataSource.projectId,
        isScanQueued: false
      };
    }

    // Secrets already awaiting review are not scanned again, so resubmitting a blocked prompt adds nothing.
    const hasNewFingerprints = uniqueFingerprints.some((fingerprint) => !knownFingerprints.has(fingerprint));

    if (hasNewFingerprints) {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: dataSource.projectId
      });

      const payload: TClaudeCodePromptSubmission = {
        dataSourceId,
        submitter,
        encryptedPrompt: encryptor({ plainText: Buffer.from(prompt) }).cipherTextBlob.toString("base64"),
        // Scanning with the project's config can surface secrets beyond the plugin's fingerprints; those already
        // recorded are left out so they aren't added again under this submitter.
        excludedFingerprints: [...knownFingerprints],
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
    }

    return {
      allowed: isReportOnly,
      onSecretDetected,
      pendingFingerprints,
      projectId: dataSource.projectId,
      isScanQueued: hasNewFingerprints
    };
  };

  return {
    submitPrompt
  };
};
