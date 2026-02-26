import { ActionProjectType } from "@app/db/schemas";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TGitHubConnection } from "@app/services/app-connection/github/github-connection-types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";

import { scanAwsIamIdentities } from "./aws/aws-nhi-scanner";
import { scanGitHubOrgIdentities } from "./github/github-nhi-scanner";
import { TNhiIdentityDALFactory, TNhiScanDALFactory, TNhiSourceDALFactory } from "./nhi-dal";
import { NhiProvider, NhiScanStatus } from "./nhi-enums";
import { sendNhiScanNotification } from "./nhi-notification-fns";
import { TNhiPolicyServiceFactory } from "./nhi-policy-service";
import { computeRiskScore, TGitHubRiskMetadata } from "./nhi-risk-scoring";
import { TRawNhiIdentity } from "./nhi-scanner-types";
import {
  TAcceptNhiIdentityRiskDTO,
  TCreateNhiSourceDTO,
  TDeleteNhiSourceDTO,
  TGetNhiIdentityByIdDTO,
  TGetNhiScanDTO,
  TGetNhiStatsDTO,
  TListNhiIdentitiesDTO,
  TListNhiScansDTO,
  TListNhiSourcesDTO,
  TRevokeNhiIdentityRiskAcceptanceDTO,
  TTriggerNhiScanDTO,
  TUpdateNhiIdentityDTO,
  TUpdateNhiSourceDTO
} from "./nhi-types";

type TNhiServiceFactoryDep = {
  nhiSourceDAL: TNhiSourceDALFactory;
  nhiIdentityDAL: TNhiIdentityDALFactory;
  nhiScanDAL: TNhiScanDALFactory;
  nhiPolicyService?: Pick<TNhiPolicyServiceFactory, "evaluatePolicies">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  projectDAL?: Pick<TProjectDALFactory, "findById">;
  projectSlackConfigDAL?: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  kmsService?: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TNhiServiceFactory = ReturnType<typeof nhiServiceFactory>;

export const nhiServiceFactory = ({
  nhiSourceDAL,
  nhiIdentityDAL,
  nhiScanDAL,
  nhiPolicyService,
  permissionService,
  appConnectionService,
  gatewayService,
  gatewayV2Service,
  projectDAL,
  projectSlackConfigDAL,
  kmsService
}: TNhiServiceFactoryDep) => {
  const checkProjectPermission = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
  }) => {
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.NHI
    });
  };

  // --- Sources ---

  const listSources = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId }: TListNhiSourcesDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiSourceDAL.find({ projectId });
  };

  const createSource = async ({
    projectId,
    name,
    provider,
    connectionId,
    config,
    scanSchedule,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreateNhiSourceDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiSourceDAL.create({
      projectId,
      name,
      provider,
      connectionId,
      orgId: actorOrgId,
      createdByUserId: actorId,
      ...(config ? { config } : {}),
      ...(scanSchedule ? { scanSchedule } : {})
    });
  };

  const updateSource = async ({
    sourceId,
    projectId,
    name,
    scanSchedule,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateNhiSourceDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const source = await nhiSourceDAL.findById(sourceId);
    if (!source) {
      throw new NotFoundError({ message: `NHI source with ID ${sourceId} not found` });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (scanSchedule !== undefined) updateData.scanSchedule = scanSchedule;

    return nhiSourceDAL.updateById(sourceId, updateData);
  };

  const deleteSource = async ({
    sourceId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteNhiSourceDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiSourceDAL.deleteById(sourceId);
  };

  // --- Scans ---

  const scanAwsSource = async (
    source: { connectionId: string | null },
    orgServiceActor: OrgServiceActor
  ): Promise<TRawNhiIdentity[]> => {
    if (!source.connectionId) {
      throw new Error("Source connection not found");
    }

    const connection = await appConnectionService.connectAppConnectionById(
      AppConnection.AWS,
      source.connectionId,
      orgServiceActor
    );

    const awsConnectionConfig: TAwsConnectionConfig = {
      app: AppConnection.AWS,
      method: connection.method,
      credentials: connection.credentials,
      orgId: orgServiceActor.orgId
    } as TAwsConnectionConfig;

    return scanAwsIamIdentities(awsConnectionConfig);
  };

  const scanGitHubSource = async (
    source: { connectionId: string | null; config: unknown },
    orgServiceActor: OrgServiceActor
  ): Promise<TRawNhiIdentity[]> => {
    if (!source.connectionId) {
      throw new Error("Source connection not found");
    }

    const sourceConfig = (source.config || {}) as Record<string, unknown>;
    const orgName = sourceConfig.orgName as string | undefined;
    if (!orgName) {
      throw new Error("GitHub source requires orgName in config");
    }

    const connection = await appConnectionService.connectAppConnectionById<TGitHubConnection>(
      AppConnection.GitHub,
      source.connectionId,
      orgServiceActor
    );

    return scanGitHubOrgIdentities({
      connection,
      orgName,
      gatewayService,
      gatewayV2Service
    });
  };

  const buildGitHubRiskMetadata = (raw: TRawNhiIdentity): TGitHubRiskMetadata | undefined => {
    const meta = raw.metadata;
    return {
      readOnly: meta.readOnly as boolean | undefined,
      tokenExpiresAt: meta.tokenExpiresAt as string | null | undefined,
      repositorySelection: meta.repositorySelection as string | undefined,
      identityType: raw.type
    };
  };

  const performScan = async (sourceId: string, scanId: string, orgServiceActor: OrgServiceActor) => {
    try {
      const source = await nhiSourceDAL.findById(sourceId);
      if (!source || !source.connectionId) {
        throw new Error("Source or connection not found");
      }

      const narrowedSource = { ...source, connectionId: source.connectionId, config: source.config };

      let rawIdentities: TRawNhiIdentity[];
      const isGitHub = source.provider === NhiProvider.GitHub;

      if (isGitHub) {
        rawIdentities = await scanGitHubSource(narrowedSource, orgServiceActor);
      } else {
        rawIdentities = await scanAwsSource(narrowedSource, orgServiceActor);
      }

      // Compute risk scores and upsert
      const identitiesForUpsert = rawIdentities.map((raw) => {
        const githubMetadata = isGitHub ? buildGitHubRiskMetadata(raw) : undefined;

        const { score, factors } = computeRiskScore({
          policies: raw.policies,
          keyCreateDate: raw.keyCreateDate,
          keyLastUsedDate: raw.keyLastUsedDate,
          lastActivityAt: raw.lastActivityAt,
          githubMetadata
        });

        return {
          sourceId,
          projectId: source.projectId,
          externalId: raw.externalId,
          name: raw.name,
          type: raw.type,
          provider: raw.provider,
          metadata: raw.metadata,
          riskScore: score,
          riskFactors: JSON.stringify(factors),
          lastActivityAt: raw.lastActivityAt ? new Date(raw.lastActivityAt) : null,
          lastSeenAt: new Date()
        };
      });

      if (identitiesForUpsert.length > 0) {
        await nhiIdentityDAL.upsert(identitiesForUpsert, ["sourceId", "externalId"]);
      }

      // Update scan as completed
      await nhiScanDAL.updateById(scanId, {
        status: NhiScanStatus.Completed,
        identitiesFound: rawIdentities.length
      });

      // Update source
      await nhiSourceDAL.updateById(sourceId, {
        lastScanStatus: NhiScanStatus.Completed,
        lastScannedAt: new Date(),
        lastIdentitiesFound: rawIdentities.length
      });

      // Send Slack notification for scan completion
      if (projectSlackConfigDAL && kmsService) {
        try {
          await sendNhiScanNotification({
            projectId: source.projectId,
            sourceName: source.name,
            identitiesFound: rawIdentities.length,
            projectSlackConfigDAL,
            kmsService
          });
        } catch (notifErr) {
          logger.warn(notifErr, `NHI scan notification failed for source ${sourceId}`);
        }
      }

      // Evaluate automated remediation policies
      if (nhiPolicyService) {
        try {
          await nhiPolicyService.evaluatePolicies({
            projectId: source.projectId,
            scanId,
            sourceId,
            orgServiceActor
          });
        } catch (policyErr) {
          logger.warn(policyErr, `NHI policy evaluation failed for scan ${scanId}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error(err, `NHI scan failed for source ${sourceId}`);

      await nhiScanDAL.updateById(scanId, {
        status: NhiScanStatus.Failed,
        statusMessage: message
      });

      await nhiSourceDAL.updateById(sourceId, {
        lastScanStatus: NhiScanStatus.Failed,
        lastScanMessage: message
      });
    }
  };

  const triggerScan = async ({
    sourceId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TTriggerNhiScanDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const source = await nhiSourceDAL.findById(sourceId);
    if (!source) {
      throw new NotFoundError({ message: `NHI source with ID ${sourceId} not found` });
    }

    // Create scan record and mark source as scanning
    const scan = await nhiScanDAL.create({
      sourceId,
      projectId,
      status: NhiScanStatus.Scanning
    });

    await nhiSourceDAL.updateById(sourceId, { lastScanStatus: NhiScanStatus.Scanning });

    // Fire-and-forget — build actor for background connection access
    const orgActor: OrgServiceActor = {
      type: actor,
      id: actorId,
      authMethod: actorAuthMethod,
      orgId: actorOrgId,
      rootOrgId: actorOrgId,
      parentOrgId: actorOrgId
    };
    void performScan(sourceId, scan.id, orgActor);

    return { scan };
  };

  const listScans = async ({ sourceId, projectId, actor, actorId, actorAuthMethod, actorOrgId }: TListNhiScansDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiScanDAL.find({ sourceId }, { sort: [["createdAt", "desc"]], limit: 20 });
  };

  const getScan = async ({ scanId, projectId, actor, actorId, actorAuthMethod, actorOrgId }: TGetNhiScanDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const scan = await nhiScanDAL.findById(scanId);
    if (!scan) {
      throw new NotFoundError({ message: `Scan with ID ${scanId} not found` });
    }
    return scan;
  };

  // --- Identities ---

  const listIdentities = async ({
    projectId,
    search,
    riskLevel,
    type,
    sourceId,
    provider,
    status,
    ownerFilter,
    page,
    limit,
    sortBy,
    sortDir,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListNhiIdentitiesDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    return nhiIdentityDAL.findByProjectId({
      projectId,
      search,
      riskLevel,
      type,
      sourceId,
      provider,
      status,
      ownerFilter,
      page,
      limit,
      sortBy,
      sortDir
    });
  };

  const getIdentityById = async ({
    identityId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetNhiIdentityByIdDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const identity = await nhiIdentityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ message: `NHI identity with ID ${identityId} not found` });
    }
    return identity;
  };

  const updateIdentity = async ({
    identityId,
    projectId,
    ownerEmail,
    status,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateNhiIdentityDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const identity = await nhiIdentityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ message: `NHI identity with ID ${identityId} not found` });
    }

    const updateData: Record<string, unknown> = {};
    if (ownerEmail !== undefined) updateData.ownerEmail = ownerEmail;
    if (status !== undefined) updateData.status = status;

    // Recompute risk score if owner changed (NO_OWNER factor)
    if (ownerEmail !== undefined) {
      const metadata = (identity.metadata || {}) as Record<string, unknown>;
      const isGitHub = identity.provider === NhiProvider.GitHub;
      const githubMetadata = isGitHub
        ? {
            readOnly: metadata.readOnly as boolean | undefined,
            tokenExpiresAt: metadata.tokenExpiresAt as string | null | undefined,
            repositorySelection: metadata.repositorySelection as string | undefined,
            identityType: identity.type
          }
        : undefined;

      const { score, factors } = computeRiskScore({
        policies: (metadata.policies as string[]) || [],
        keyCreateDate: (metadata.createDate as string) || null,
        keyLastUsedDate: (metadata.lastUsedDate as string) || null,
        lastActivityAt: identity.lastActivityAt ? new Date(identity.lastActivityAt) : null,
        ownerEmail: ownerEmail || null,
        githubMetadata
      });
      updateData.riskScore = score;
      updateData.riskFactors = JSON.stringify(factors);
    }

    return nhiIdentityDAL.updateById(identityId, updateData);
  };

  // --- Risk Acceptance ---

  const acceptRisk = async ({
    identityId,
    projectId,
    reason,
    expiresAt,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAcceptNhiIdentityRiskDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const identity = await nhiIdentityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ message: `NHI identity with ID ${identityId} not found` });
    }

    return nhiIdentityDAL.updateById(identityId, {
      riskAcceptedAt: new Date(),
      riskAcceptedByUserId: actorId,
      riskAcceptedReason: reason,
      riskAcceptedExpiresAt: expiresAt ? new Date(expiresAt) : null
    });
  };

  const revokeRiskAcceptance = async ({
    identityId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRevokeNhiIdentityRiskAcceptanceDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const identity = await nhiIdentityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ message: `NHI identity with ID ${identityId} not found` });
    }

    return nhiIdentityDAL.updateById(identityId, {
      riskAcceptedAt: null,
      riskAcceptedByUserId: null,
      riskAcceptedReason: null,
      riskAcceptedExpiresAt: null
    });
  };

  // --- Stats ---

  const getStats = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId }: TGetNhiStatsDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiIdentityDAL.getStatsByProjectId(projectId);
  };

  return {
    listSources,
    createSource,
    updateSource,
    deleteSource,
    triggerScan,
    performScan,
    listScans,
    getScan,
    listIdentities,
    getIdentityById,
    updateIdentity,
    acceptRisk,
    revokeRiskAcceptance,
    getStats
  };
};
