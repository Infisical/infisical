import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';
import {
	IntegrationAuth,
	Bot 
} from '../../models';
import { INTEGRATION_SET, getIntegrationOptions as getIntegrationOptionsFunc } from '../../variables';
import { IntegrationService } from '../../services';
import {
	getApps, 
	getTeams,
	revokeAccess 
} from '../../integrations';
import {
	INTEGRATION_VERCEL_API_URL
} from '../../variables';
import request from '../../config/request';

/***
 * Return integration authorization with id [integrationAuthId]
 */
export const getIntegrationAuth = async (req: Request, res: Response) => {
	let integrationAuth;
	try {
		const { integrationAuthId } = req.params;
		integrationAuth = await IntegrationAuth.findById(integrationAuthId);
		
		if (!integrationAuth) return res.status(400).send({
			message: 'Failed to find integration authorization'
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get integration authorization'
		});	
	}
	
	return res.status(200).send({
		integrationAuth
	});
}

export const getIntegrationOptions = async (req: Request, res: Response) => {
	const INTEGRATION_OPTIONS = getIntegrationOptionsFunc();

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
	try {
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
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get OAuth2 code-token exchange'
		});
	}
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
	try {
		const {
			workspaceId,
			accessId,
			accessToken,
			integration
		}: {
			workspaceId: string;
			accessId: string | null;
			accessToken: string;
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
            integration
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
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to save access token for integration'
		});
	}
	
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
	let apps;
	try {
		const teamId = req.query.teamId as string;
		
		apps = await getApps({
			integrationAuth: req.integrationAuth,
			accessToken: req.accessToken,
			...teamId && { teamId }
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: "Failed to get integration authorization applications",
		});
	}

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
 * Return list of available Vercel (preview) branches
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
		const { data }: { data: VercelBranch[] } = await request.get(
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
 * Delete integration authorization with id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const deleteIntegrationAuth = async (req: Request, res: Response) => {
  let integrationAuth;
  try {
    integrationAuth = await revokeAccess({
      integrationAuth: req.integrationAuth,
      accessToken: req.accessToken,
    });
  } catch (err) {
    Sentry.setUser({ email: req.user.email });
    Sentry.captureException(err);
    return res.status(400).send({
      message: "Failed to delete integration authorization",
    });
  }

  return res.status(200).send({
    integrationAuth,
  });
};
