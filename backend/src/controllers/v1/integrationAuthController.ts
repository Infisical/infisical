import { Request, Response } from "express";
import { Types } from "mongoose";
import { standardRequest } from "@app/config/request";
import { getApps, getTeams, revokeAccess } from "@app/integrations";
import { Bot, IntegrationAuth, Workspace } from "@app/models";
import { EventType } from "@app/ee/models";
import { IntegrationService } from "@app/services";
import { EEAuditLogService } from "@app/ee/services";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_UTF8,
  INTEGRATION_BITBUCKET_API_URL,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_NORTHFLANK_API_URL,
  INTEGRATION_RAILWAY_API_URL,
  INTEGRATION_SET,
  INTEGRATION_VERCEL_API_URL,
  getIntegrationOptions as getIntegrationOptionsFunc
} from "@app/variables";
import { exchangeRefresh } from "@app/integrations";
import { validateRequest } from "@app/helpers/validation";
import * as reqValidator from "@app/validation/integrationAuth";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "@app/ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { getIntegrationAuthAccessHelper } from "@app/helpers";
import { ObjectId } from "mongodb";

/***
 * Return integration authorization with id [integrationAuthId]
 */
export const getIntegrationAuth = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId }
  } = await validateRequest(reqValidator.GetIntegrationAuthV1, req);

  const integrationAuth = await IntegrationAuth.findById(integrationAuthId);

  if (!integrationAuth)
    return res.status(400).send({
      message: "Failed to find integration authorization"
    });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  return res.status(200).send({
    integrationAuth
  });
};

export const getIntegrationOptions = async (req: Request, res: Response) => {
  const INTEGRATION_OPTIONS = await getIntegrationOptionsFunc();

  return res.status(200).send({
    integrationOptions: INTEGRATION_OPTIONS
  });
};

/**
 * Perform OAuth2 code-token exchange as part of integration [integration] for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const oAuthExchange = async (req: Request, res: Response) => {
  const {
    body: { integration, workspaceId, code, url }
  } = await validateRequest(reqValidator.OauthExchangeV1, req);
  if (!INTEGRATION_SET.has(integration)) throw new Error("Failed to validate integration");

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Integrations
  );

  const workspace = await Workspace.findById(workspaceId);
  const environments = workspace?.environments || [];
  if (environments.length === 0) {
    throw new Error("Failed to get environments");
  }

  const integrationAuth = await IntegrationService.handleOAuthExchange({
    workspaceId,
    integration,
    code,
    environment: environments[0].slug,
    url
  });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.AUTHORIZE_INTEGRATION,
      metadata: {
        integration: integrationAuth.integration
      }
    },
    {
      workspaceId: integrationAuth.workspace
    }
  );

  return res.status(200).send({
    integrationAuth
  });
};

/**
 * Save integration access token and (optionally) access id as part of integration
 * [integration] for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const saveIntegrationToken = async (req: Request, res: Response) => {
  // TODO: refactor
  // TODO: check if access token is valid for each integration
  let integrationAuth;
  const {
    body: { workspaceId, integration, url, accessId, namespace, accessToken, refreshToken }
  } = await validateRequest(reqValidator.SaveIntegrationAccessTokenV1, req);

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Integrations
  );

  const bot = await Bot.findOne({
    workspace: new Types.ObjectId(workspaceId),
    isActive: true
  });

  if (!bot) throw new Error("Bot must be enabled to save integration access token");

  integrationAuth = await IntegrationAuth.findOneAndUpdate(
    {
      workspace: new Types.ObjectId(workspaceId),
      integration
    },
    {
      workspace: new Types.ObjectId(workspaceId),
      integration,
      url,
      namespace,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8,
      ...(integration === INTEGRATION_GCP_SECRET_MANAGER
        ? {
            metadata: {
              authMethod: "serviceAccount"
            }
          }
        : {})
    },
    {
      new: true,
      upsert: true
    }
  );

  // encrypt and save integration access details
  if (refreshToken) {
    await exchangeRefresh({
      integrationAuth,
      refreshToken
    });
  }

  // encrypt and save integration access details
  if (accessId || accessToken) {
    integrationAuth = await IntegrationService.setIntegrationAuthAccess({
      integrationAuthId: integrationAuth._id.toString(),
      accessId,
      accessToken,
      accessExpiresAt: undefined
    });
  }

  if (!integrationAuth) throw new Error("Failed to save integration access token");

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.AUTHORIZE_INTEGRATION,
      metadata: {
        integration: integrationAuth.integration
      }
    },
    {
      workspaceId: integrationAuth.workspace
    }
  );

  return res.status(200).send({
    integrationAuth
  });
};

/**
 * Return list of applications allowed for integration with integration authorization id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthApps = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { teamId, workspaceSlug }
  } = await validateRequest(reqValidator.GetIntegrationAuthAppsV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken, accessId } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  const apps = await getApps({
    integrationAuth: integrationAuth,
    accessToken: accessToken,
    accessId: accessId,
    ...(teamId && { teamId }),
    ...(workspaceSlug && { workspaceSlug })
  });

  return res.status(200).send({
    apps
  });
};

/**
 * Return list of teams allowed for integration with integration authorization id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthTeams = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId }
  } = await validateRequest(reqValidator.GetIntegrationAuthTeamsV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  const teams = await getTeams({
    integrationAuth: integrationAuth,
    accessToken: accessToken
  });

  return res.status(200).send({
    teams
  });
};

/**
 * Return list of available Vercel (preview) branches for Vercel project with
 * id [appId]
 * @param req
 * @param res
 */
export const getIntegrationAuthVercelBranches = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { appId }
  } = await validateRequest(reqValidator.GetIntegrationAuthVercelBranchesV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  interface VercelBranch {
    ref: string;
    lastCommit: string;
    isProtected: boolean;
  }

  const params = new URLSearchParams({
    projectId: appId,
    ...(integrationAuth.teamId
      ? {
          teamId: integrationAuth.teamId
        }
      : {})
  });

  let branches: string[] = [];

  if (appId && appId !== "") {
    const { data }: { data: VercelBranch[] } = await standardRequest.get(
      `${INTEGRATION_VERCEL_API_URL}/v1/integrations/git-branches`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    branches = data.map((b) => b.ref);
  }

  return res.status(200).send({
    branches
  });
};

/**
 * Return list of Railway environments for Railway project with
 * id [appId]
 * @param req
 * @param res
 */
export const getIntegrationAuthRailwayEnvironments = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { appId }
  } = await validateRequest(reqValidator.GetIntegrationAuthRailwayEnvironmentsV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  interface RailwayEnvironment {
    node: {
      id: string;
      name: string;
      isEphemeral: boolean;
    };
  }

  interface Environment {
    environmentId: string;
    name: string;
  }

  let environments: Environment[] = [];

  if (appId && appId !== "") {
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
    } = await standardRequest.post(
      INTEGRATION_RAILWAY_API_URL,
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

    environments = edges.map((e: RailwayEnvironment) => {
      return {
        name: e.node.name,
        environmentId: e.node.id
      };
    });
  }

  return res.status(200).send({
    environments
  });
};

/**
 * Return list of Railway services for Railway project with id
 * [appId]
 * @param req
 * @param res
 */
export const getIntegrationAuthRailwayServices = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { appId }
  } = await validateRequest(reqValidator.GetIntegrationAuthRailwayServicesV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  interface RailwayService {
    node: {
      id: string;
      name: string;
    };
  }

  interface Service {
    name: string;
    serviceId: string;
  }

  let services: Service[] = [];

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

  if (appId && appId !== "") {
    const variables = {
      id: appId
    };

    const {
      data: {
        data: {
          project: {
            services: { edges }
          }
        }
      }
    } = await standardRequest.post(
      INTEGRATION_RAILWAY_API_URL,
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

    services = edges.map((e: RailwayService) => ({
      name: e.node.name,
      serviceId: e.node.id
    }));
  }

  return res.status(200).send({
    services
  });
};

/**
 * Return list of workspaces allowed for Bitbucket integration
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthBitBucketWorkspaces = async (req: Request, res: Response) => {
  interface WorkspaceResponse {
    size: number;
    page: number;
    pageLen: number;
    next: string;
    previous: string;
    values: Array<Workspace>;
  }

  interface Workspace {
    type: string;
    uuid: string;
    name: string;
    slug: string;
    is_private: boolean;
    created_on: string;
    updated_on: string;
  }

  const {
    params: { integrationAuthId }
  } = await validateRequest(reqValidator.GetIntegrationAuthBitbucketWorkspacesV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  const workspaces: Workspace[] = [];
  let hasNextPage = true;
  let workspaceUrl = `${INTEGRATION_BITBUCKET_API_URL}/2.0/workspaces`;

  while (hasNextPage) {
    const { data }: { data: WorkspaceResponse } = await standardRequest.get(workspaceUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    });

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

  return res.status(200).send({
    workspaces
  });
};

/**
 * Return list of secret groups for Northflank project with id [appId]
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthNorthflankSecretGroups = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { appId }
  } = await validateRequest(reqValidator.GetIntegrationAuthNorthflankSecretGroupsV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  interface NorthflankSecretGroup {
    id: string;
    name: string;
    description: string;
    priority: number;
    projectId: string;
  }

  interface SecretGroup {
    name: string;
    groupId: string;
  }

  const secretGroups: SecretGroup[] = [];

  if (appId && appId !== "") {
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
      } = await standardRequest.get<{ data: { secrets: NorthflankSecretGroup[] } }>(
        `${INTEGRATION_NORTHFLANK_API_URL}/v1/projects/${appId}/secrets`,
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

      page++;
    }
  }

  return res.status(200).send({
    secretGroups
  });
};

/**
 * Return list of build configs for TeamCity project with id [appId]
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthTeamCityBuildConfigs = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId, appId }
  } = await validateRequest(reqValidator.GetIntegrationAuthTeamCityBuildConfigsV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  interface TeamCityBuildConfig {
    id: string;
    name: string;
    projectName: string;
    projectId: string;
    href: string;
    webUrl: string;
  }

  interface GetTeamCityBuildConfigsRes {
    count: number;
    href: string;
    buildType: TeamCityBuildConfig[];
  }

  if (appId && appId !== "") {
    const {
      data: { buildType }
    } = await standardRequest.get<GetTeamCityBuildConfigsRes>(
      `${req.integrationAuth.url}/app/rest/buildTypes`,
      {
        params: {
          locator: `project:${appId}`
        },
        headers: {
          Authorization: `Bearer ${req.accessToken}`,
          Accept: "application/json"
        }
      }
    );

    return res.status(200).send({
      buildConfigs: buildType.map((buildConfig) => ({
        name: buildConfig.name,
        buildConfigId: buildConfig.id
      }))
    });
  }

  return res.status(200).send({
    buildConfigs: []
  });
};

/**
 * Delete integration authorization with id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const deleteIntegrationAuth = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId }
  } = await validateRequest(reqValidator.DeleteIntegrationAuthV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new ObjectId(integrationAuthId)
  });

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    integrationAuth.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Integrations
  );

  const deletedIntegrationAuth = await revokeAccess({
    integrationAuth: integrationAuth,
    accessToken: accessToken
  });

  if (!deletedIntegrationAuth)
    return res.status(400).send({
      message: "Failed to find integration authorization"
    });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UNAUTHORIZE_INTEGRATION,
      metadata: {
        integration: deletedIntegrationAuth.integration
      }
    },
    {
      workspaceId: deletedIntegrationAuth.workspace
    }
  );

  return res.status(200).send({
    integrationAuth: deletedIntegrationAuth
  });
};
