import { Request, Response } from "express";
import { Types } from "mongoose";
import { standardRequest } from "../../config/request";
import { getApps, getTeams, revokeAccess } from "../../integrations";
import { Bot, IntegrationAuth, Workspace } from "../../models";
import { EventType } from "../../ee/models";
import { IntegrationService } from "../../services";
import { EEAuditLogService } from "../../ee/services";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_UTF8,
  INTEGRATION_BITBUCKET_API_URL,
  INTEGRATION_CHECKLY_API_URL,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_NORTHFLANK_API_URL,
  INTEGRATION_QOVERY_API_URL,
  INTEGRATION_RAILWAY_API_URL,
  INTEGRATION_SET,
  INTEGRATION_VERCEL_API_URL,
  getIntegrationOptions as getIntegrationOptionsFunc
} from "../../variables";
import { exchangeRefresh } from "../../integrations";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/integrationAuth";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { getIntegrationAuthAccessHelper } from "../../helpers";

/***
 * Return integration authorization with id [integrationAuthId]
 */
export const getIntegrationAuth = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId }
  } = await validateRequest(reqValidator.GetIntegrationAuthV1, req);

  const integrationAuth = await IntegrationAuth.findById(integrationAuthId);

  if (!integrationAuth) return res.status(400).send({
    message: "Failed to find integration authorization"
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

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

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });
  
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

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });
  
  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });
  
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
 * Return list of Checkly groups for a specific user
 * @param req
 * @param res
 */
export const getIntegrationAuthChecklyGroups = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { accountId }
  } = await validateRequest(reqValidator.GetIntegrationAuthChecklyGroupsV1, req);
  
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  interface ChecklyGroup {
    id: number;
    name: string;
  }
  
  if (accountId && accountId !== "") {
    const { data }: { data: ChecklyGroup[] } = (
      await standardRequest.get(`${INTEGRATION_CHECKLY_API_URL}/v1/check-groups`, {
          headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
              "X-Checkly-Account": accountId
          }
      })
    );
    
    return res.status(200).send({
      groups: data.map((g: ChecklyGroup) => ({
        name: g.name,
        groupId: g.id,
      }))
    });
  }

  return res.status(200).send({
    groups: []
  });
}

/**
 * Return list of Qovery Orgs for a specific user
 * @param req
 * @param res
 */
export const getIntegrationAuthQoveryOrgs = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId }
  } = await validateRequest(reqValidator.GetIntegrationAuthQoveryOrgsV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  const { data } = await standardRequest.get(
    `${INTEGRATION_QOVERY_API_URL}/organization`,
    {
      headers: {
        Authorization: `Token ${accessToken}`,
        "Accept": "application/json",
      },
    }
  );

  interface QoveryOrg {
    id: string;
    name: string;
  }

  const orgs = data.results.map((a: QoveryOrg) => {
    return {
      name: a.name,
      orgId: a.id,
    };
  });

  return res.status(200).send({
    orgs
  });
};

/**
 * Return list of Qovery Projects for a specific orgId
 * @param req
 * @param res
 */
export const getIntegrationAuthQoveryProjects = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { orgId }
  } = await validateRequest(reqValidator.GetIntegrationAuthQoveryProjectsV1, req);
  
  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );
  
  interface Project {
    name: string;
    projectId: string;
  }

  interface QoveryProject {
    id: string;
    name: string;
  }
  
  let projects: Project[] = [];
  
  if (orgId && orgId !== "") {
    const { data } = await standardRequest.get(
      `${INTEGRATION_QOVERY_API_URL}/organization/${orgId}/project`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          "Accept": "application/json",
        },
      }
    );

    projects = data.results.map((a: QoveryProject) => {
      return {
        name: a.name,
        projectId: a.id,
      };
    });
  }

  return res.status(200).send({
    projects
  });
};

/**
 * Return list of Qovery environments for project with id [projectId]
 * @param req
 * @param res
 */
export const getIntegrationAuthQoveryEnvironments = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { projectId }
  } = await validateRequest(reqValidator.GetIntegrationAuthQoveryEnvironmentsV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );
  
  interface Environment {
    name: string;
    environmentId: string;
  }

  interface QoveryEnvironment {
    id: string;
    name: string;
  }
  
  let environments: Environment[] = [];
  
  if (projectId && projectId !== "" && projectId !== "none") { // TODO: fix
    const { data } = await standardRequest.get(
      `${INTEGRATION_QOVERY_API_URL}/project/${projectId}/environment`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          "Accept": "application/json",
        },
      }
    );

    environments = data.results.map((a: QoveryEnvironment) => {
      return {
        name: a.name,
        environmentId: a.id,
      };
    });
  }

  return res.status(200).send({
    environments
  });
};

/**
 * Return list of Qovery apps for environment with id [environmentId]
 * @param req
 * @param res
 */
export const getIntegrationAuthQoveryApps = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { environmentId }
  } = await validateRequest(reqValidator.GetIntegrationAuthQoveryScopesV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );
  
  interface App {
    name: string;
    appId: string;  
  }

  interface QoveryApp {
    id: string;
    name: string;
  }
  
  let apps: App[] = [];
  
  if (environmentId && environmentId !== "") {
    const { data } = await standardRequest.get(
      `${INTEGRATION_QOVERY_API_URL}/environment/${environmentId}/application`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          "Accept": "application/json",
        },
      }
    );

    apps = data.results.map((a: QoveryApp) => {
      return {
        name: a.name,
        appId: a.id,
      };
    });
  }

  return res.status(200).send({
    apps
  });
};

/**
 * Return list of Qovery containers for environment with id [environmentId]
 * @param req
 * @param res
 */
export const getIntegrationAuthQoveryContainers = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { environmentId }
  } = await validateRequest(reqValidator.GetIntegrationAuthQoveryScopesV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );
  
  interface Container {
    name: string;
    appId: string;
  }

  interface QoveryContainer {
    id: string;
    name: string;
  }
  
  let containers: Container[] = [];
  
  if (environmentId && environmentId !== "") {
    const { data } = await standardRequest.get(
      `${INTEGRATION_QOVERY_API_URL}/environment/${environmentId}/container`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          "Accept": "application/json",
        },
      }
    );

    containers = data.results.map((a: QoveryContainer) => {
      return {
        name: a.name,
        appId: a.id,
      };
    });
  }

  return res.status(200).send({
    containers
  });
};

/**
 * Return list of Qovery jobs for environment with id [environmentId]
 * @param req
 * @param res
 */
export const getIntegrationAuthQoveryJobs = async (req: Request, res: Response) => {
  const {
    params: { integrationAuthId },
    query: { environmentId }
  } = await validateRequest(reqValidator.GetIntegrationAuthQoveryScopesV1, req);

  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );
  
  interface Job {
    name: string;
    appId: string;  
  }

  interface QoveryJob {
    id: string;
    name: string;
  }
  
  let jobs: Job[] = [];
  
  if (environmentId && environmentId !== "") {
    const { data } = await standardRequest.get(
      `${INTEGRATION_QOVERY_API_URL}/environment/${environmentId}/job`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          "Accept": "application/json",
        },
      }
    );

    jobs = data.results.map((a: QoveryJob) => {
      return {
        name: a.name,
        appId: a.id,
      };
    });
  }

  return res.status(200).send({
    jobs
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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });
  
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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });
  
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
    params: { integrationAuthId },
    query: { appId }
  } = await validateRequest(reqValidator.GetIntegrationAuthTeamCityBuildConfigsV1, req);
  
  // TODO(akhilmhdh): remove class -> static function path and makes these into reusable independent functions
  const { integrationAuth, accessToken } = await getIntegrationAuthAccessHelper({
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });

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
    integrationAuthId: new Types.ObjectId(integrationAuthId)
  });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace
  });
  
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
