import { ForbiddenError } from "@casl/ability";
import { InstallProvider } from "@slack/oauth";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TSlackIntegrationDALFactory } from "./slack-integration-dal";
import {
  TCompleteSlackIntegrationDTO,
  TDeleteSlackIntegrationDTO,
  TGetSlackInstallUrlDTO,
  TGetSlackIntegrationByProjectIdDTO,
  TUpdateSlackIntegrationDTO
} from "./slack-types";

type TSlackServiceFactoryDep = {
  slackIntegrationDAL: Pick<
    TSlackIntegrationDALFactory,
    "create" | "findOne" | "findById" | "updateById" | "deleteById"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSlackServiceFactory = ReturnType<typeof slackServiceFactory>;

export const slackServiceFactory = ({
  projectDAL,
  permissionService,
  slackIntegrationDAL,
  kmsService
}: TSlackServiceFactoryDep) => {
  const completeSlackIntegration = async ({
    projectId,
    teamId,
    teamName,
    slackUserId,
    slackAppId,
    botAccessToken,
    slackBotId,
    slackBotUserId
  }: TCompleteSlackIntegrationDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: "Project not found"
      });
    }

    const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: project.orgId
    });

    const { cipherTextBlob: encryptedBotAccessToken } = orgDataKeyEncryptor({
      plainText: Buffer.from(botAccessToken, "utf8")
    });

    await slackIntegrationDAL.create({
      projectId,
      teamId,
      teamName,
      slackUserId,
      slackAppId,
      slackBotId,
      slackBotUserId,
      encryptedBotAccessToken
    });
  };

  const getSlackInstaller = async () => {
    const appCfg = getConfig();

    if (!appCfg.SLACK_CLIENT_ID || !appCfg.SLACK_CLIENT_SECRET) {
      throw new BadRequestError({
        message: "Invalid slack configuration"
      });
    }

    return new InstallProvider({
      clientId: appCfg.SLACK_CLIENT_ID,
      clientSecret: appCfg.SLACK_CLIENT_SECRET,
      stateSecret: appCfg.AUTH_SECRET,
      legacyStateVerification: true,
      installationStore: {
        storeInstallation: async (installation) => {
          if (installation.isEnterpriseInstall && installation.enterprise?.id) {
            throw new BadRequestError({
              message: "Enterprise not yet supported"
            });
          }

          const metadata = JSON.parse(installation.metadata || "") as {
            projectId: string;
          };

          return completeSlackIntegration({
            projectId: metadata.projectId,
            teamId: installation.team?.id || "",
            teamName: installation.team?.name || "",
            slackUserId: installation.user.id,
            slackAppId: installation.appId || "",
            botAccessToken: installation.bot?.token || "",
            slackBotId: installation.bot?.id || "",
            slackBotUserId: installation.bot?.userId || ""
          });
        },
        // for our use-case we don't need to implement this because this will only be used
        // when listening for events from slack
        fetchInstallation: () => {
          return {} as never;
        },
        // for our use-case we don't need to implement this yet
        deleteInstallation: () => {
          return {} as never;
        }
      }
    });
  };

  const getInstallUrl = async ({ actorId, actor, actorOrgId, actorAuthMethod, projectId }: TGetSlackInstallUrlDTO) => {
    const appCfg = getConfig();
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: "Project not found"
      });
    }

    const installer = await getSlackInstaller();
    const url = await installer.generateInstallUrl({
      scopes: ["chat:write.public", "chat:write", "channels:read", "groups:read", "im:read", "mpim:read"],
      metadata: JSON.stringify({
        projectId: project.id
      }),
      redirectUri: `${appCfg.SITE_URL}/api/v1/slack/oauth_redirect`
    });

    return url;
  };

  const getSlackIntegrationByProjectId = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TGetSlackIntegrationByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
    const slackIntegration = await slackIntegrationDAL.findOne({
      projectId
    });

    return slackIntegration;
  };

  const updateSlackIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    isAccessRequestNotificationEnabled,
    accessRequestChannels,
    isSecretRequestNotificationEnabled,
    secretRequestChannels
  }: TUpdateSlackIntegrationDTO) => {
    const slackIntegration = await slackIntegrationDAL.findById(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found"
      });
    }
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      slackIntegration.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    return slackIntegrationDAL.updateById(slackIntegration.id, {
      isAccessRequestNotificationEnabled,
      accessRequestChannels,
      isSecretRequestNotificationEnabled,
      secretRequestChannels
    });
  };

  const deleteSlackIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TDeleteSlackIntegrationDTO) => {
    const slackIntegration = await slackIntegrationDAL.findById(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found"
      });
    }
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      slackIntegration.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

    return slackIntegrationDAL.deleteById(id);
  };

  return {
    getInstallUrl,
    getSlackIntegrationByProjectId,
    completeSlackIntegration,
    getSlackInstaller,
    updateSlackIntegration,
    deleteSlackIntegration
  };
};
