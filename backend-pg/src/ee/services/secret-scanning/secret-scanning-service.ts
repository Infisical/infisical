import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import { WebhookEventMap } from "@octokit/webhooks-types";
import { ProbotOctokit } from "probot";

import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";

import { TGitAppDalFactory } from "./git-app-dal";
import { TGitAppInstallSessionDalFactory } from "./git-app-install-session-dal";
import { TSecretScanningDalFactory } from "./secret-scanning-dal";
import { TSecretScanningQueueFactory } from "./secret-scanning-queue";
import {
  SecretScanningRiskStatus,
  TGetOrgInstallStatusDTO,
  TGetOrgRisksDTO,
  TInstallAppSessionDTO,
  TLinkInstallSessionDTO,
  TUpdateRiskStatusDTO
} from "./secret-scanning-types";

type TSecretScanningServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  secretScanningDal: TSecretScanningDalFactory;
  gitAppInstallSessionDal: TGitAppInstallSessionDalFactory;
  gitAppOrgDal: TGitAppDalFactory;
  secretScanningQueue: TSecretScanningQueueFactory;
};

export type TSecretScanningServiceFactory = ReturnType<typeof secretScanningServiceFactory>;

export const secretScanningServiceFactory = ({
  secretScanningDal,
  gitAppOrgDal,
  gitAppInstallSessionDal,
  permissionService,
  secretScanningQueue
}: TSecretScanningServiceFactoryDep) => {
  const createInstallationSession = async ({ actor, orgId, actorId }: TInstallAppSessionDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.SecretScanning
    );

    const sessionId = crypto.randomBytes(16).toString("hex");
    await gitAppInstallSessionDal.upsert({ orgId, sessionId, userId: actorId });
    return { sessionId };
  };

  const linkInstallationToOrg = async ({
    sessionId,
    actorId,
    installationId,
    actor
  }: TLinkInstallSessionDTO) => {
    const session = await gitAppInstallSessionDal.findOne({ sessionId });
    if (!session) throw new UnauthorizedError({ message: "Session not found" });

    const { permission } = await permissionService.getOrgPermission(actor, actorId, session.orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.SecretScanning
    );
    const installatedApp = await gitAppOrgDal.transaction(async (tx) => {
      await gitAppInstallSessionDal.deleteById(session.id, tx);
      return gitAppOrgDal.upsert({ orgId: session.orgId, installationId, userId: actorId }, tx);
    });

    const appCfg = getConfig();
    const octokit = new ProbotOctokit({
      auth: {
        appId: appCfg.SECRET_SCANNING_GIT_APP_ID,
        privateKey: appCfg.SECRET_SCANNING_PRIVATE_KEY,
        installationId: installationId.toString()
      }
    });

    const {
      data: { repositories }
    } = await octokit.apps.listReposAccessibleToInstallation();
    await Promise.all(
      repositories.map(({ id, full_name }) =>
        secretScanningQueue.startFullRepoScan({
          organizationId: session.orgId,
          installationId,
          repository: { id, fullName: full_name }
        })
      )
    );
    return { installatedApp };
  };

  const getOrgInstallationStatus = async ({ actorId, orgId, actor }: TGetOrgInstallStatusDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.SecretScanning
    );

    const appInstallation = await gitAppOrgDal.findOne({ orgId });
    return Boolean(appInstallation);
  };

  const getRisksByOrg = async ({ actor, orgId, actorId }: TGetOrgRisksDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.SecretScanning
    );
    const risks = await secretScanningDal.find({ orgId }, { sort: [["createdAt", "desc"]] });
    return { risks };
  };

  const updateRiskStatus = async ({
    actorId,
    orgId,
    actor,
    riskId,
    status
  }: TUpdateRiskStatusDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.SecretScanning
    );

    const isRiskResolved = Boolean(
      [
        SecretScanningRiskStatus.FalsePositive,
        SecretScanningRiskStatus.Revoked,
        SecretScanningRiskStatus.NotRevoked
      ].includes(status)
    );

    const risk = await secretScanningDal.updateById(riskId, {
      status,
      isResolved: isRiskResolved
    });
    return { risk };
  };

  const handleRepoPushEvent = async (payload: WebhookEventMap["push"]) => {
    const { commits, repository, installation, pusher } = payload;
    if (!commits || !repository || !installation || !pusher) {
      return;
    }

    const installationLink = await gitAppOrgDal.findOne({
      installationId: String(installation.id)
    });
    if (!installationLink) return;

    await secretScanningQueue.startPushEventScan({
      commits,
      pusher: { name: pusher.name, email: pusher.email },
      repository: { fullName: repository.full_name, id: repository.id },
      organizationId: installationLink.orgId,
      installationId: String(installation?.id)
    });
  };

  const handleRepoDeleteEvent = async (installationId: string, repositoryIds: string[]) => {
    await secretScanningDal.transaction(async (tx) => {
      if (repositoryIds.length) {
        await Promise.all(
          Object.keys(repositoryIds).map((key) =>
            secretScanningDal.delete({ repositoryId: key }, tx)
          )
        );
      }
      await gitAppOrgDal.delete({ installationId }, tx);
    });
  };

  return {
    createInstallationSession,
    linkInstallationToOrg,
    getOrgInstallationStatus,
    getRisksByOrg,
    updateRiskStatus,
    handleRepoPushEvent,
    handleRepoDeleteEvent
  };
};
