import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import { WebhookEventMap } from "@octokit/webhooks-types";
import { ProbotOctokit } from "probot";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TGitAppDALFactory } from "./git-app-dal";
import { TGitAppInstallSessionDALFactory } from "./git-app-install-session-dal";
import { TSecretScanningDALFactory } from "./secret-scanning-dal";
import { TSecretScanningQueueFactory } from "./secret-scanning-queue";
import {
  SecretScanningRiskStatus,
  TGetAllOrgRisksDTO,
  TGetOrgInstallStatusDTO,
  TGetOrgRisksDTO,
  TInstallAppSessionDTO,
  TLinkInstallSessionDTO,
  TUpdateRiskStatusDTO
} from "./secret-scanning-types";

type TSecretScanningServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  secretScanningDAL: TSecretScanningDALFactory;
  gitAppInstallSessionDAL: TGitAppInstallSessionDALFactory;
  gitAppOrgDAL: TGitAppDALFactory;
  secretScanningQueue: TSecretScanningQueueFactory;
};

export type TSecretScanningServiceFactory = ReturnType<typeof secretScanningServiceFactory>;

export const secretScanningServiceFactory = ({
  secretScanningDAL,
  gitAppOrgDAL,
  gitAppInstallSessionDAL,
  permissionService,
  secretScanningQueue
}: TSecretScanningServiceFactoryDep) => {
  const createInstallationSession = async ({
    actor,
    orgId,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TInstallAppSessionDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.SecretScanning);

    const sessionId = crypto.randomBytes(16).toString("hex");
    await gitAppInstallSessionDAL.upsert({ orgId, sessionId, userId: actorId });
    return { sessionId };
  };

  const linkInstallationToOrg = async ({
    sessionId,
    actorId,
    installationId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TLinkInstallSessionDTO) => {
    const session = await gitAppInstallSessionDAL.findOne({ sessionId });
    if (!session) throw new NotFoundError({ message: "Session was not found" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      session.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.SecretScanning);
    const installatedApp = await gitAppOrgDAL.transaction(async (tx) => {
      await gitAppInstallSessionDAL.deleteById(session.id, tx);
      return gitAppOrgDAL.upsert({ orgId: session.orgId, installationId, userId: actorId }, tx);
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
    if (appCfg.SECRET_SCANNING_ORG_WHITELIST?.includes(actorOrgId)) {
      await Promise.all(
        repositories.map(({ id, full_name }) =>
          secretScanningQueue.startFullRepoScan({
            organizationId: session.orgId,
            installationId,
            repository: { id, fullName: full_name }
          })
        )
      );
    }
    return { installatedApp };
  };

  const getOrgInstallationStatus = async ({
    actorId,
    orgId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TGetOrgInstallStatusDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.SecretScanning);

    const appInstallation = await gitAppOrgDAL.findOne({ orgId });
    return Boolean(appInstallation);
  };

  const getRisksByOrg = async ({ actor, orgId, actorId, actorAuthMethod, actorOrgId, filter }: TGetOrgRisksDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.SecretScanning);

    const results = await secretScanningDAL.findByOrgId(orgId, filter);

    return results;
  };

  const getAllRisksByOrg = async ({ actor, orgId, actorId, actorAuthMethod, actorOrgId }: TGetAllOrgRisksDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.SecretScanning);

    const risks = await secretScanningDAL.find({ orgId }, { sort: [["createdAt", "desc"]] });
    return risks;
  };

  const updateRiskStatus = async ({
    actorId,
    orgId,
    actor,
    actorOrgId,
    actorAuthMethod,
    riskId,
    status
  }: TUpdateRiskStatusDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.SecretScanning);

    const isRiskResolved = Boolean(
      [
        SecretScanningRiskStatus.FalsePositive,
        SecretScanningRiskStatus.Revoked,
        SecretScanningRiskStatus.NotRevoked
      ].includes(status)
    );

    const risk = await secretScanningDAL.updateById(riskId, {
      status,
      isResolved: isRiskResolved
    });
    return { risk };
  };

  const handleRepoPushEvent = async (payload: WebhookEventMap["push"]) => {
    const appCfg = getConfig();
    const { commits, repository, installation, pusher } = payload;
    if (!commits || !repository || !installation || !pusher) {
      return;
    }

    const installationLink = await gitAppOrgDAL.findOne({
      installationId: String(installation.id)
    });
    if (!installationLink) return;

    if (appCfg.SECRET_SCANNING_ORG_WHITELIST?.includes(installationLink.orgId)) {
      await secretScanningQueue.startPushEventScan({
        commits,
        pusher: { name: pusher.name, email: pusher.email },
        repository: { fullName: repository.full_name, id: repository.id },
        organizationId: installationLink.orgId,
        installationId: String(installation?.id)
      });
    }
  };

  const handleRepoDeleteEvent = async (installationId: string, repositoryIds: string[]) => {
    await secretScanningDAL.transaction(async (tx) => {
      if (repositoryIds.length) {
        await Promise.all(repositoryIds.map((repoId) => secretScanningDAL.delete({ repositoryId: repoId }, tx)));
      }
      await gitAppOrgDAL.delete({ installationId }, tx);
    });
  };

  return {
    createInstallationSession,
    linkInstallationToOrg,
    getOrgInstallationStatus,
    getRisksByOrg,
    getAllRisksByOrg,
    updateRiskStatus,
    handleRepoPushEvent,
    handleRepoDeleteEvent
  };
};
