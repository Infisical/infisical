import * as express from 'express';
import { Types } from 'mongoose';
import { 
	IUser,
	IServiceAccount,
	IServiceTokenData,
	ISecret 
} from '../../models';
import {
	AuthData
} from '../../interfaces/middleware';

declare module 'express' {
	interface Request {
		user?: any;
	}
}

// TODO: fix (any) types
declare global {
	namespace Express {
		interface Request {
			clientIp: any;
			user: any;
			workspace: any;
			membership: any;
			targetMembership: any;
			providerAuthToken: any;
			organization: any;
			membershipOrg: any;
			integration: any;
			integrationAuth: any;
			bot: any;
			_secret: any;
			secrets: any;
			secretSnapshot: any;
			serviceToken: any;
			serviceAccount: any;
			accessToken: any;
			serviceTokenData: any;
			apiKeyData: any;
			query?: any;
			tokenVersionId?: Types.ObjectId;
			authData: AuthData;
			requestData: {
				[key: string]: string
			};
		}
	}
}
