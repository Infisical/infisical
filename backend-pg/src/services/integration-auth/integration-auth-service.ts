import { ForbiddenError } from "@casl/ability";

import {
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  TIntegrationAuths,
  TIntegrationAuthsInsert
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { request } from "@app/lib/config/request";
import {
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8
} from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TIntegrationDalFactory } from "../integration/integration-dal";
import { TProjectBotDalFactory } from "../project-bot/project-bot-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { getApps } from "./integration-app-list";
import { TIntegrationAuthDalFactory } from "./integration-auth-dal";
import {
  TBitbucketWorkspace,
  TChecklyGroups,
  TDeleteIntegrationAuthDTO,
  TGetIntegrationAuthDTO,
  TGetIntegrationAuthTeamCityBuildConfigDTO,
  TIntegrationAuthAppsDTO,
  TIntegrationAuthBitbucketWorkspaceDTO,
  TIntegrationAuthChecklyGroupsDTO,
  TIntegrationAuthNorthflankSecretGroupDTO,
  TIntegrationAuthQoveryEnvironmentsDTO,
  TIntegrationAuthQoveryOrgsDTO,
  TIntegrationAuthQoveryProjectDTO,
  TIntegrationAuthQoveryScopesDTO,
  TIntegrationAuthRailwayEnvDTO,
  TIntegrationAuthRailwayServicesDTO,
  TIntegrationAuthTeamsDTO,
  TIntegrationAuthVercelBranchesDTO,
  TNorthflankSecretGroup,
  TOauthExchangeDTO,
  TSaveIntegrationAccessTokenDTO,
  TTeamCityBuildConfig,
  TVercelBranches
} from "./integration-auth-types";
import { getIntegrationOptions, Integrations, IntegrationUrls } from "./integration-list";
import { getTeams } from "./integration-team";
import { exchangeCode, exchangeRefresh } from "./integration-token";

type TIntegrationAuthServiceFactoryDep = {
  integrationAuthDal: TIntegrationAuthDalFactory;
  integrationDal: Pick<TIntegrationDalFactory, "delete">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  projectBotDal: Pick<TProjectBotDalFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TIntegrationAuthServiceFactory = ReturnType<typeof integrationAuthServiceFactory>;

export const integrationAuthServiceFactory = ({
  permissionService,
  integrationAuthDal,
  integrationDal,
  projectBotDal,
  projectBotService
}: TIntegrationAuthServiceFactoryDep) => {
  const listIntegrationAuthByProjectId = async ({
    actorId,
    actor,
    projectId
  }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const authorizations = await integrationAuthDal.find({ projectId });
    return authorizations;
  };

  const getIntegrationAuth = async ({ actor, id, actorId }: TGetIntegrationAuthDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    return integrationAuth;
  };

  const oauthExchange = async ({
    projectId,
    actorId,
    actor,
    integration,
    url,
    code
  }: TOauthExchangeDTO) => {
    if (!Object.values(Integrations).includes(integration as Integrations))
      throw new BadRequestError({ message: "Invalid integration" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Integrations
    );

    const bot = await projectBotDal.findOne({ isActive: true, projectId });
    if (!bot)
      throw new BadRequestError({ message: "Bot must be enabled for oauth2 code token exchange" });

    const tokenExchange = await exchangeCode({ integration, code, url });
    const updateDoc: TIntegrationAuthsInsert = {
      projectId,
      integration,
      url: tokenExchange?.url,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      keyEncoding: SecretKeyEncoding.UTF8,
      accessExpiresAt: tokenExchange.accessExpiresAt
    };

    if (integration === Integrations.VERCEL) {
      updateDoc.teamId = tokenExchange.teamId;
    } else if (integration === Integrations.NETLIFY) {
      updateDoc.accountId = tokenExchange.accountId;
    } else if (integration === Integrations.GCP_SECRET_MANAGER) {
      updateDoc.metadata = {
        authMethod: "oauth2"
      };
    }

    const key = await projectBotService.getBotKey(projectId);
    if (tokenExchange.refreshToken) {
      const refreshEncToken = encryptSymmetric128BitHexKeyUTF8(tokenExchange.refreshToken, key);
      updateDoc.refreshIV = refreshEncToken.iv;
      updateDoc.refreshTag = refreshEncToken.tag;
      updateDoc.refreshCiphertext = refreshEncToken.ciphertext;
    }
    if (tokenExchange.accessToken) {
      const accessEncToken = encryptSymmetric128BitHexKeyUTF8(tokenExchange.accessToken, key);
      updateDoc.accessIV = accessEncToken.iv;
      updateDoc.accessTag = accessEncToken.tag;
      updateDoc.accessCiphertext = accessEncToken.ciphertext;
    }
    return integrationAuthDal.transaction(async (tx) => {
      const doc = await integrationAuthDal.findOne({ projectId, integration }, tx);
      if (!doc) {
        return integrationAuthDal.create(updateDoc, tx);
      }
      return integrationAuthDal.updateById(doc.id, updateDoc, tx);
    });
  };

  const saveIntegrationToken = async ({
    projectId,
    refreshToken,
    actorId,
    integration,
    url,
    actor,
    accessId,
    namespace,
    accessToken
  }: TSaveIntegrationAccessTokenDTO) => {
    if (!Object.values(Integrations).includes(integration as Integrations))
      throw new BadRequestError({ message: "Invalid integration" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Integrations
    );

    const bot = await projectBotDal.findOne({ isActive: true, projectId });
    if (!bot)
      throw new BadRequestError({ message: "Bot must be enabled for oauth2 code token exchange" });

    const updateDoc: TIntegrationAuthsInsert = {
      projectId,
      namespace,
      integration,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      keyEncoding: SecretKeyEncoding.UTF8,
      ...(integration === Integrations.GCP_SECRET_MANAGER
        ? {
            metadata: {
              authMethod: "serviceAccount"
            }
          }
        : {})
    };

    const key = await projectBotService.getBotKey(projectId);
    if (refreshToken) {
      const tokenDetails = await exchangeRefresh(
        integration,
        refreshToken,
        url,
        updateDoc.metadata as Record<string, string>
      );
      const refreshEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.refreshToken, key);
      updateDoc.refreshIV = refreshEncToken.iv;
      updateDoc.refreshTag = refreshEncToken.tag;
      updateDoc.refreshCiphertext = refreshEncToken.ciphertext;
      const accessEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.accessToken, key);
      updateDoc.accessIV = accessEncToken.iv;
      updateDoc.accessTag = accessEncToken.tag;
      updateDoc.accessCiphertext = accessEncToken.ciphertext;
      updateDoc.accessExpiresAt = tokenDetails.accessExpiresAt;
    }

    if (!refreshToken && (accessId || accessToken)) {
      if (accessToken) {
        const accessEncToken = encryptSymmetric128BitHexKeyUTF8(accessToken, key);
        updateDoc.accessIV = accessEncToken.iv;
        updateDoc.accessTag = accessEncToken.tag;
        updateDoc.accessCiphertext = accessEncToken.ciphertext;
      }
      if (accessId) {
        const accessEncToken = encryptSymmetric128BitHexKeyUTF8(accessId, key);
        updateDoc.accessIdIV = accessEncToken.iv;
        updateDoc.accessIdTag = accessEncToken.tag;
        updateDoc.accessIdCiphertext = accessEncToken.ciphertext;
      }
    }
    return integrationAuthDal.transaction(async (tx) => {
      const doc = await integrationAuthDal.findOne({ projectId, integration }, tx);
      if (!doc) {
        return integrationAuthDal.create(updateDoc, tx);
      }
      return integrationAuthDal.updateById(doc.id, updateDoc, tx);
    });
  };

  // helper function
  const getIntegrationAccessToken = async (integrationAuth: TIntegrationAuths, botKey: string) => {
    let accessToken: string | undefined;
    let accessId: string | undefined;
    if (integrationAuth.accessTag && integrationAuth.accessIV && integrationAuth.accessCiphertext) {
      accessToken = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: integrationAuth.accessCiphertext,
        iv: integrationAuth.accessIV,
        tag: integrationAuth.accessTag,
        key: botKey
      });
    }

    if (
      integrationAuth.refreshCiphertext &&
      integrationAuth.refreshIV &&
      integrationAuth.refreshTag
    ) {
      const refreshToken = decryptSymmetric128BitHexKeyUTF8({
        key: botKey,
        ciphertext: integrationAuth.refreshCiphertext,
        iv: integrationAuth.refreshIV,
        tag: integrationAuth.refreshTag
      });

      if (integrationAuth.accessExpiresAt && integrationAuth.accessExpiresAt < new Date()) {
        // refer above it contains same logic except not saving
        const tokenDetails = await exchangeRefresh(
          integrationAuth.integration,
          refreshToken,
          integrationAuth?.url,
          integrationAuth.metadata as Record<string, string>
        );
        const refreshEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.refreshToken, botKey);
        const accessEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.accessToken, botKey);
        accessToken = tokenDetails.accessToken;
        await integrationAuthDal.updateById(integrationAuth.id, {
          refreshIV: refreshEncToken.iv,
          refreshTag: refreshEncToken.tag,
          refreshCiphertext: refreshEncToken.ciphertext,
          accessExpiresAt: tokenDetails.accessExpiresAt,
          accessIV: accessEncToken.iv,
          accessTag: accessEncToken.tag,
          accessCiphertext: accessEncToken.ciphertext
        });
      }
    }
    if (!accessToken) throw new BadRequestError({ message: "Missing access token" });

    if (
      integrationAuth.accessIdTag &&
      integrationAuth.accessIdIV &&
      integrationAuth.accessIdCiphertext
    ) {
      accessId = decryptSymmetric128BitHexKeyUTF8({
        key: botKey,
        ciphertext: integrationAuth.accessIdCiphertext,
        iv: integrationAuth.accessIdIV,
        tag: integrationAuth.accessIdTag
      });
    }
    return { accessId, accessToken };
  };

  const getIntegrationApps = async ({
    actor,
    actorId,
    teamId,
    id,
    workspaceSlug
  }: TIntegrationAuthAppsDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );

    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken, accessId } = await getIntegrationAccessToken(integrationAuth, botKey);
    const apps = await getApps({
      integration: integrationAuth.integration,
      accessToken,
      accessId,
      teamId,
      workspaceSlug,
      url: integrationAuth.url
    });
    return apps;
  };

  const getIntegrationAuthTeams = async ({ actor, actorId, id }: TIntegrationAuthTeamsDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );

    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    const teams = await getTeams({
      integration: integrationAuth.integration,
      accessToken,
      url: integrationAuth.url || ""
    });
    return teams;
  };

  const getVercelBranches = async ({
    appId,
    id,
    actor,
    actorId
  }: TIntegrationAuthVercelBranchesDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);

    if (appId) {
      const { data } = await request.get<TVercelBranches[]>(
        `${IntegrationUrls.VERCEL_API_URL}/v1/integrations/git-branches`,
        {
          params: {
            projectId: appId,
            teamId: integrationAuth.teamId
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
      return data.map((b) => b.ref);
    }
    return [];
  };

  const getChecklyGroups = async ({
    actorId,
    actor,
    id,
    accountId
  }: TIntegrationAuthChecklyGroupsDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (accountId) {
      const { data } = await request.get<TChecklyGroups[]>(
        `${IntegrationUrls.CHECKLY_API_URL}/v1/check-groups`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "X-Checkly-Account": accountId
          }
        }
      );
      return data.map(({ name, id: groupId }) => ({ name, groupId }));
    }
    return [];
  };

  const getQoveryOrgs = async ({ actorId, actor, id }: TIntegrationAuthQoveryOrgsDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    const { data } = await request.get<{ results: Array<{ id: string; name: string }> }>(
      `${IntegrationUrls.QOVERY_API_URL}/organization`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    return data.results.map(({ name, id: orgId }) => ({ name, orgId }));
  };

  const getQoveryProjects = async ({
    actorId,
    actor,
    id,
    orgId
  }: TIntegrationAuthQoveryProjectDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (orgId) {
      const { data } = await request.get<{ results: Array<{ id: string; name: string }> }>(
        `${IntegrationUrls.QOVERY_API_URL}/organization/${orgId}/project`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
      return data.results.map(({ name, id: projectId }) => ({ name, projectId }));
    }
    return [];
  };

  const getQoveryEnvs = async ({
    projectId,
    id,
    actor,
    actorId
  }: TIntegrationAuthQoveryEnvironmentsDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (projectId && projectId !== "none") {
      // TODO: fix
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/project/${projectId}/environment`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: environmentId, name }) => ({
        name,
        environmentId
      }));
    }
    return [];
  };

  const getQoveryApps = async ({
    id,
    actor,
    actorId,
    environmentId
  }: TIntegrationAuthQoveryScopesDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (environmentId) {
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/environment/${environmentId}/application`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: appId, name }) => ({
        name,
        appId
      }));
    }
    return [];
  };

  const getQoveryContainers = async ({
    id,
    actor,
    actorId,
    environmentId
  }: TIntegrationAuthQoveryScopesDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (environmentId) {
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/environment/${environmentId}/container`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: appId, name }) => ({
        name,
        appId
      }));
    }
    return [];
  };

  const getQoveryJobs = async ({
    id,
    actor,
    actorId,
    environmentId
  }: TIntegrationAuthQoveryScopesDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (environmentId) {
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/environment/${environmentId}/job`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: appId, name }) => ({
        name,
        appId
      }));
    }
    return [];
  };

  const getRailwayEnvironments = async ({
    id,
    actor,
    actorId,
    appId
  }: TIntegrationAuthRailwayEnvDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (appId) {
      const query = `
			query GetEnvironments($projectId: String!, $after: String, $before: String, $first: Int, $isEphemeral: Boolean, $last: Int) {
				environments(projectId: $projectId, after: $after, before: $before, first: $first, isEphemeral: $isEphemeral, last: $last) {
				edges {
					node {
					id
					name
					isEphemeral
					}
				}
				}
			}
			`;

      const variables = {
        projectId: appId
      };

      const {
        data: {
          data: {
            environments: { edges }
          }
        }
      } = await request.post<{
        data: {
          environments: { edges: { node: { id: string; name: string; isEphemeral: boolean } }[] };
        };
      }>(
        IntegrationUrls.RAILWAY_API_URL,
        {
          query,
          variables
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
      return edges.map(({ node: { name, id: environmentId } }) => ({ name, environmentId }));
    }
    return [];
  };
  const getRailwayServices = async ({
    id,
    actor,
    actorId,
    appId
  }: TIntegrationAuthRailwayServicesDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (appId) {
      const query = `
     query project($id: String!) {
        project(id: $id) {
          createdAt
          deletedAt
          id
          description
          expiredAt
          isPublic
          isTempProject
          isUpdatable
          name
          prDeploys
          teamId
          updatedAt
          upstreamUrl
		  services {
			edges {
				node {
					id
					name
				}
			}
		  }
        }
      }
      `;

      const variables = {
        projectId: appId
      };

      const {
        data: {
          data: {
            project: {
              services: { edges }
            }
          }
        }
      } = await request.post<{
        data: {
          project: {
            services: { edges: { node: { id: string; name: string; isEphemeral: boolean } }[] };
          };
        };
      }>(
        IntegrationUrls.RAILWAY_API_URL,
        {
          query,
          variables
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
      return edges.map(({ node: { name, id: serviceId } }) => ({ name, serviceId }));
    }
    return [];
  };

  const getBitbucketWorkspaces = async ({
    actorId,
    actor,
    id
  }: TIntegrationAuthBitbucketWorkspaceDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    const workspaces: TBitbucketWorkspace[] = [];
    let hasNextPage = true;
    let workspaceUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/workspaces`;

    while (hasNextPage) {
      // eslint-disable-next-line
      const { data }: { data: { values: TBitbucketWorkspace[]; next: string } } = await request.get(
        workspaceUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );

      if (data?.values.length > 0) {
        data.values.forEach((workspace) => {
          workspaces.push(workspace);
        });
      }

      if (data.next) {
        workspaceUrl = data.next;
      } else {
        hasNextPage = false;
      }
    }
    return workspaces;
  };

  const getNorthFlankSecretGroups = async ({
    id,
    actor,
    actorId,
    appId
  }: TIntegrationAuthNorthflankSecretGroupDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    const secretGroups: { name: string; groupId: string }[] = [];

    if (appId) {
      let page = 1;
      const perPage = 10;
      let hasMorePages = true;

      while (hasMorePages) {
        const params = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
          filter: "all"
        });

        const {
          data: {
            data: { secrets }
          }
          // eslint-disable-next-line
        } = await request.get<{ data: { secrets: TNorthflankSecretGroup[] } }>(
          `${IntegrationUrls.NORTHFLANK_API_URL}/v1/projects/${appId}/secrets`,
          {
            params,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );

        secrets.forEach((a: any) => {
          secretGroups.push({
            name: a.name,
            groupId: a.id
          });
        });

        if (secrets.length < perPage) {
          hasMorePages = false;
        }

        page += 1;
      }
    }
    return secretGroups;
  };

  const getTeamcityBuildConfigs = async ({
    appId,
    id,
    actorId,
    actor
  }: TGetIntegrationAuthTeamCityBuildConfigDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );
    const botKey = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, botKey);
    if (appId) {
      const {
        data: { buildType }
      } = await request.get<{ buildType: TTeamCityBuildConfig[] }>(
        `${integrationAuth.url}/app/rest/buildTypes`,
        {
          params: {
            locator: `project:${appId}`
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return buildType.map(({ name, id: buildConfigId }) => ({
        name,
        buildConfigId
      }));
    }
    return [];
  };

  const deleteIntegrationAuth = async ({ id, actorId, actor }: TDeleteIntegrationAuthDTO) => {
    const integrationAuth = await integrationAuthDal.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Integrations
    );

    const delIntegrationAuth = await integrationAuthDal.transaction(async (tx) => {
      const doc = await integrationAuthDal.deleteById(integrationAuth.id, tx);
      if (!doc) throw new BadRequestError({ message: "Faled to find integration" });
      await integrationDal.delete({ integrationAuthId: doc.id }, tx);
      return doc;
    });

    return delIntegrationAuth;
    // TODO(akhilmhdh-pg): add audit log
  };

  return {
    listIntegrationAuthByProjectId,
    getIntegrationOptions,
    getIntegrationAuth,
    oauthExchange,
    saveIntegrationToken,
    deleteIntegrationAuth,
    getIntegrationAuthTeams,
    getIntegrationApps,
    getVercelBranches,
    getApps,
    getChecklyGroups,
    getQoveryApps,
    getQoveryEnvs,
    getQoveryJobs,
    getQoveryOrgs,
    getQoveryProjects,
    getQoveryContainers,
    getRailwayServices,
    getRailwayEnvironments,
    getNorthFlankSecretGroups,
    getTeamcityBuildConfigs,
    getBitbucketWorkspaces
  };
};
