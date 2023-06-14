import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
	IntegrationAuth,
	Bot 
} from '../../models';
import { ALGORITHM_AES_256_GCM, ENCODING_SCHEME_UTF8, INTEGRATION_SET, getIntegrationOptions as getIntegrationOptionsFunc } from '../../variables';
import { IntegrationService } from '../../services';
import {
	getApps, 
	getTeams,
	revokeAccess 
} from '../../integrations';
import {
	INTEGRATION_VERCEL_API_URL,
	INTEGRATION_RAILWAY_API_URL
} from '../../variables';
import { standardRequest } from '../../config/request';

/***
 * Return integration authorization with id [integrationAuthId]
 */
export const getIntegrationAuth = async (req: Request, res: Response) => {
  const { integrationAuthId } = req.params;
  const integrationAuth = await IntegrationAuth.findById(integrationAuthId);
  
  if (!integrationAuth) return res.status(400).send({
    message: 'Failed to find integration authorization'
  });

	return res.status(200).send({
		integrationAuth
	});
}

export const getIntegrationOptions = async (req: Request, res: Response) => {
	const INTEGRATION_OPTIONS = await getIntegrationOptionsFunc();

	return res.status(200).send({
		integrationOptions: INTEGRATION_OPTIONS,
	});
};

/**
 * Perform OAuth2 code-token exchange as part of integration [integration] for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const oAuthExchange = async (
	req: Request,
	res: Response
) => {
  const { workspaceId, code, integration } = req.body;
  if (!INTEGRATION_SET.has(integration))
    throw new Error('Failed to validate integration');
  
  const environments = req.membership.workspace?.environments || [];
  if(environments.length === 0){
    throw new Error("Failed to get environments")
  }

  const integrationAuth = await IntegrationService.handleOAuthExchange({
    workspaceId,
    integration,
    code,
    environment: environments[0].slug,
  });
  
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
export const saveIntegrationAccessToken = async (
  req: Request,
  res: Response
) => {
	// TODO: refactor
	// TODO: check if access token is valid for each integration

	let integrationAuth;
	const {
		workspaceId,
		accessId,
		accessToken,
		url,
		namespace,
		integration
	}: {
		workspaceId: string;
		accessId: string | null;
		accessToken: string;
		url: string;
		namespace: string;
		integration: string;
	} = req.body;

	const bot = await Bot.findOne({
		workspace: new Types.ObjectId(workspaceId),
		isActive: true
	});
      
    if (!bot) throw new Error('Bot must be enabled to save integration access token');

  	integrationAuth = await IntegrationAuth.findOneAndUpdate({
		workspace: new Types.ObjectId(workspaceId),
		integration
    }, {
		workspace: new Types.ObjectId(workspaceId),
		integration,
		url,
		namespace,
		algorithm: ALGORITHM_AES_256_GCM,
		keyEncoding: ENCODING_SCHEME_UTF8
  	}, {
		new: true,
		upsert: true
    });
  
	// encrypt and save integration access details
	integrationAuth = await IntegrationService.setIntegrationAuthAccess({
		integrationAuthId: integrationAuth._id.toString(),
		accessId,
		accessToken,
		accessExpiresAt: undefined
	});
  
  	if (!integrationAuth) throw new Error('Failed to save integration access token');
	
	return res.status(200).send({
		integrationAuth
	});
}

/**
 * Return list of applications allowed for integration with integration authorization id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthApps = async (req: Request, res: Response) => {
  const teamId = req.query.teamId as string;
  
  const apps = await getApps({
    integrationAuth: req.integrationAuth,
    accessToken: req.accessToken,
    ...teamId && { teamId }
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
	const teams = await getTeams({
		integrationAuth: req.integrationAuth,
		accessToken: req.accessToken
	});
	
	return res.status(200).send({
		teams
	});
}

/**
 * Return list of available Vercel (preview) branches for Vercel project with
 * id [appId]
 * @param req 
 * @param res 
 */
export const getIntegrationAuthVercelBranches = async (req: Request, res: Response) => {
	const { integrationAuthId } = req.params;
	const appId = req.query.appId as string;
	
	interface VercelBranch {
		ref: string;
		lastCommit: string;
		isProtected: boolean;
	}

	const params = new URLSearchParams({
		projectId: appId,
		...(req.integrationAuth.teamId ? {
			teamId: req.integrationAuth.teamId
		} : {})
	});

	let branches: string[] = [];
	
	if (appId && appId !== '') {
		const { data }: { data: VercelBranch[] } = await standardRequest.get(
			`${INTEGRATION_VERCEL_API_URL}/v1/integrations/git-branches`,
			{
				params,
				headers: {
					Authorization: `Bearer ${req.accessToken}`,
					'Accept-Encoding': 'application/json'
				}
			}
		);
		
		branches = data.map((b) => b.ref);
	}

	return res.status(200).send({
		branches
	});
}

/**
 * Return list of Railway environments for Railway project with
 * id [appId]
 * @param req 
 * @param res 
 */
export const getIntegrationAuthRailwayEnvironments = async (req: Request, res: Response) => {
	const { integrationAuthId } = req.params;
	const appId = req.query.appId as string;
	
	interface RailwayEnvironment {
		node: {
			id: string;
			name: string;
			isEphemeral: boolean;
		}
	}
	
	interface Environment {
		environmentId: string;
		name: string;
	}
	
	let environments: Environment[] = [];

	if (appId && appId !== '') {
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
		}
		
		const { data: { data: { environments: { edges } } } } = await standardRequest.post(INTEGRATION_RAILWAY_API_URL, {
			query,
			variables,
		}, {
			headers: {
				'Authorization': `Bearer ${req.accessToken}`,
				'Content-Type': 'application/json',
			},
		});
		
		environments = edges.map((e: RailwayEnvironment) => {
			return ({
				name: e.node.name,
				environmentId: e.node.id
			});
		});
	}
	
	return res.status(200).send({
		environments
	});
}

/**
 * Return list of Railway services for Railway project with id
 * [appId]
 * @param req 
 * @param res 
 */
export const getIntegrationAuthRailwayServices = async (req: Request, res: Response) => {
	const { integrationAuthId } = req.params;
	const appId = req.query.appId as string;
	
	interface RailwayService {
		node: {
			id: string;
			name: string;
		}
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

	if (appId && appId !== '') {
		const variables = {
			id: appId
		}
		
		const { data: { data: { project: { services: { edges } } } } } = await standardRequest.post(INTEGRATION_RAILWAY_API_URL, {
			query,
			variables
		}, {
			headers: {
				'Authorization': `Bearer ${req.accessToken}`,
				'Content-Type': 'application/json',
			},
		});
		
		services = edges.map((e: RailwayService) => ({
			name: e.node.name,
			serviceId: e.node.id
		}));
	}
	
	return res.status(200).send({
		services
	});
}

/**
 * Delete integration authorization with id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const deleteIntegrationAuth = async (req: Request, res: Response) => {
  const integrationAuth = await revokeAccess({
    integrationAuth: req.integrationAuth,
    accessToken: req.accessToken,
  });

  return res.status(200).send({
    integrationAuth,
  });
};
