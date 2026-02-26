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

import { executeAwsRemediation } from "./aws/aws-nhi-remediation";
import { executeGitHubRemediation } from "./github/github-nhi-remediation";
import { TNhiIdentityDALFactory, TNhiSourceDALFactory } from "./nhi-dal";
import { NhiIdentityType, NhiProvider, NhiRemediationActionType, NhiRemediationStatus } from "./nhi-enums";
import { TNhiRemediationActionDALFactory } from "./nhi-remediation-dal";
import { computeRiskScore, NhiRiskFactor, TGitHubRiskMetadata } from "./nhi-risk-scoring";
import { TExecuteRemediationDTO, TGetRecommendedActionsDTO, TListRemediationActionsDTO } from "./nhi-types";

type TNhiRemediationServiceDep = {
  nhiRemediationActionDAL: TNhiRemediationActionDALFactory;
  nhiIdentityDAL: TNhiIdentityDALFactory;
  nhiSourceDAL: TNhiSourceDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

export type TNhiRemediationServiceFactory = ReturnType<typeof nhiRemediationServiceFactory>;

type TRecommendedAction = {
  actionType: NhiRemediationActionType;
  label: string;
  description: string;
  severity: string;
  riskFactor: string;
};

const RISK_FACTOR_ACTION_MAP: {
  riskFactor: string;
  identityTypes: string[];
  actionType: NhiRemediationActionType;
  label: string;
  description: string;
}[] = [
  {
    riskFactor: NhiRiskFactor.HAS_ADMIN_ACCESS,
    identityTypes: [NhiIdentityType.IamUser],
    actionType: NhiRemediationActionType.RemoveAdminPoliciesUser,
    label: "Remove admin policies",
    description: "Detach administrator policies from this IAM user"
  },
  {
    riskFactor: NhiRiskFactor.HAS_ADMIN_ACCESS,
    identityTypes: [NhiIdentityType.IamRole],
    actionType: NhiRemediationActionType.RemoveAdminPoliciesRole,
    label: "Remove admin policies",
    description: "Detach administrator policies from this IAM role"
  },
  {
    riskFactor: NhiRiskFactor.HAS_ADMIN_ACCESS,
    identityTypes: [NhiIdentityType.GitHubAppInstallation],
    actionType: NhiRemediationActionType.SuspendAppInstallation,
    label: "Suspend app",
    description: "Suspend this GitHub App installation"
  },
  {
    riskFactor: NhiRiskFactor.CREDENTIAL_VERY_OLD,
    identityTypes: [NhiIdentityType.IamAccessKey],
    actionType: NhiRemediationActionType.DeactivateAccessKey,
    label: "Deactivate old key",
    description: "Deactivate this access key that is over 365 days old"
  },
  {
    riskFactor: NhiRiskFactor.CREDENTIAL_OLD,
    identityTypes: [NhiIdentityType.IamAccessKey],
    actionType: NhiRemediationActionType.DeactivateAccessKey,
    label: "Deactivate old key",
    description: "Deactivate this access key that is over 180 days old"
  },
  {
    riskFactor: NhiRiskFactor.NO_ROTATION_90_DAYS,
    identityTypes: [NhiIdentityType.IamAccessKey],
    actionType: NhiRemediationActionType.DeactivateAccessKey,
    label: "Deactivate unused key",
    description: "Deactivate this access key unused for over 90 days"
  },
  {
    riskFactor: NhiRiskFactor.INACTIVE_BUT_ENABLED,
    identityTypes: [NhiIdentityType.IamAccessKey],
    actionType: NhiRemediationActionType.DeactivateAccessKey,
    label: "Deactivate inactive key",
    description: "Deactivate this access key that has been inactive"
  },
  {
    riskFactor: NhiRiskFactor.INACTIVE_BUT_ENABLED,
    identityTypes: [NhiIdentityType.IamUser],
    actionType: NhiRemediationActionType.DeactivateAllAccessKeys,
    label: "Deactivate all keys",
    description: "Deactivate all access keys for this inactive IAM user"
  },
  {
    riskFactor: NhiRiskFactor.DEPLOY_KEY_WRITE_ACCESS,
    identityTypes: [NhiIdentityType.GitHubDeployKey],
    actionType: NhiRemediationActionType.DeleteDeployKey,
    label: "Delete deploy key",
    description: "Delete this deploy key that has write access"
  },
  {
    riskFactor: NhiRiskFactor.NO_EXPIRATION,
    identityTypes: [NhiIdentityType.GitHubFinegrainedPat],
    actionType: NhiRemediationActionType.RevokeFinegrainedPat,
    label: "Revoke PAT",
    description: "Revoke this personal access token with no expiration"
  },
  {
    riskFactor: NhiRiskFactor.OVERLY_PERMISSIVE_APP,
    identityTypes: [NhiIdentityType.GitHubAppInstallation],
    actionType: NhiRemediationActionType.SuspendAppInstallation,
    label: "Suspend app",
    description: "Suspend this overly permissive GitHub App installation"
  }
];

export const nhiRemediationServiceFactory = ({
  nhiRemediationActionDAL,
  nhiIdentityDAL,
  nhiSourceDAL,
  permissionService,
  appConnectionService,
  gatewayService,
  gatewayV2Service
}: TNhiRemediationServiceDep) => {
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

  const getRecommendedActions = async ({
    identityId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetRecommendedActionsDTO): Promise<TRecommendedAction[]> => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const identity = await nhiIdentityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ message: `NHI identity with ID ${identityId} not found` });
    }

    const riskFactors = (Array.isArray(identity.riskFactors) ? identity.riskFactors : []) as {
      factor: string;
      severity: string;
    }[];

    const actions: TRecommendedAction[] = [];
    const seenActions = new Set<string>();

    for (const rf of riskFactors) {
      const mappings = RISK_FACTOR_ACTION_MAP.filter(
        (m) => m.riskFactor === rf.factor && m.identityTypes.includes(identity.type)
      );

      for (const mapping of mappings) {
        const key = `${mapping.actionType}:${rf.factor}`;
        if (!seenActions.has(key)) {
          seenActions.add(key);
          actions.push({
            actionType: mapping.actionType,
            label: mapping.label,
            description: mapping.description,
            severity: rf.severity,
            riskFactor: rf.factor
          });
        }
      }
    }

    return actions;
  };

  /**
   * Internal remediation execution that accepts an OrgServiceActor.
   * Used by both the public API (executeRemediation) and automated policy evaluation.
   */
  const executeRemediationInternal = async ({
    identityId,
    projectId,
    actionType,
    riskFactor,
    triggeredBy,
    orgServiceActor
  }: {
    identityId: string;
    projectId: string;
    actionType: NhiRemediationActionType;
    riskFactor?: string;
    triggeredBy: string;
    orgServiceActor: OrgServiceActor;
  }) => {
    const identity = await nhiIdentityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ message: `NHI identity with ID ${identityId} not found` });
    }

    const source = await nhiSourceDAL.findById(identity.sourceId);
    if (!source || !source.connectionId) {
      throw new NotFoundError({ message: "Source or connection not found for this identity" });
    }

    // Create the action record
    const action = await nhiRemediationActionDAL.create({
      identityId,
      projectId,
      sourceId: identity.sourceId,
      actionType,
      status: NhiRemediationStatus.InProgress,
      triggeredBy,
      riskFactor: riskFactor || null,
      metadata: {}
    });

    try {
      const metadata = (identity.metadata || {}) as Record<string, unknown>;
      let result: { success: boolean; message: string; details?: Record<string, unknown> };

      if (identity.provider === NhiProvider.AWS) {
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

        result = await executeAwsRemediation(awsConnectionConfig, actionType, metadata);
      } else if (identity.provider === NhiProvider.GitHub) {
        const connection = await appConnectionService.connectAppConnectionById<TGitHubConnection>(
          AppConnection.GitHub,
          source.connectionId,
          orgServiceActor
        );

        result = await executeGitHubRemediation(
          { connection, gatewayService, gatewayV2Service },
          actionType,
          metadata,
          identity.externalId
        );
      } else {
        result = { success: false, message: `Unsupported provider: ${identity.provider}` };
      }

      const updatedAction = await nhiRemediationActionDAL.updateById(action.id, {
        status: result.success ? NhiRemediationStatus.Completed : NhiRemediationStatus.Failed,
        statusMessage: result.message,
        metadata: result.details || {},
        completedAt: result.success ? new Date() : undefined
      });

      // After successful remediation, update the identity metadata and recompute risk score
      if (result.success) {
        try {
          const updatedMetadata = { ...metadata };
          const currentPolicies = (metadata.policies as string[]) || [];

          if (
            actionType === NhiRemediationActionType.RemoveAdminPoliciesUser ||
            actionType === NhiRemediationActionType.RemoveAdminPoliciesRole
          ) {
            const detachedPolicies = (result.details?.detachedPolicies as string[]) || [];
            updatedMetadata.policies = currentPolicies.filter((p) => !detachedPolicies.includes(p));
          } else if (actionType === NhiRemediationActionType.DeactivateAccessKey) {
            updatedMetadata.status = "Inactive";
          }

          const isGitHub = identity.provider === NhiProvider.GitHub;
          const githubMetadata: TGitHubRiskMetadata | undefined = isGitHub
            ? {
                readOnly: updatedMetadata.readOnly as boolean | undefined,
                tokenExpiresAt: updatedMetadata.tokenExpiresAt as string | null | undefined,
                repositorySelection: updatedMetadata.repositorySelection as string | undefined,
                identityType: identity.type
              }
            : undefined;

          const { score, factors } = computeRiskScore({
            policies: (updatedMetadata.policies as string[]) || [],
            keyCreateDate: (updatedMetadata.createDate as string) || null,
            keyLastUsedDate: (updatedMetadata.lastUsedDate as string) || null,
            lastActivityAt: identity.lastActivityAt ? new Date(identity.lastActivityAt) : null,
            ownerEmail: identity.ownerEmail || null,
            githubMetadata
          });

          await nhiIdentityDAL.updateById(identityId, {
            metadata: updatedMetadata,
            riskScore: score,
            riskFactors: JSON.stringify(factors)
          });
        } catch (err) {
          logger.warn(err, `Failed to update identity metadata after remediation for ${identityId}`);
        }
      }

      return updatedAction;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error(err, `NHI remediation failed for identity ${identityId}, action ${actionType}`);

      const updatedAction = await nhiRemediationActionDAL.updateById(action.id, {
        status: NhiRemediationStatus.Failed,
        statusMessage: message
      });

      return updatedAction;
    }
  };

  const executeRemediation = async ({
    identityId,
    projectId,
    actionType,
    riskFactor,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TExecuteRemediationDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const orgServiceActor: OrgServiceActor = {
      type: actor,
      id: actorId,
      authMethod: actorAuthMethod,
      orgId: actorOrgId,
      rootOrgId: actorOrgId,
      parentOrgId: actorOrgId
    };

    return executeRemediationInternal({
      identityId,
      projectId,
      actionType,
      riskFactor,
      triggeredBy: actorId,
      orgServiceActor
    });
  };

  const listActions = async ({
    identityId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListRemediationActionsDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiRemediationActionDAL.findByIdentityId(identityId);
  };

  return {
    executeRemediation,
    executeRemediationInternal,
    getRecommendedActions,
    listActions
  };
};
