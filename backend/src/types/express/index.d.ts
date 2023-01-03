import * as express from 'express';

// TODO: fix (any) types
declare global {
	namespace Express {
		interface Request {
			user: any;
			workspace: any;
			membership: any;
			organization: any;
			membershipOrg: any;
			integration: any;
			integrationAuth: any;
			bot: any;
			secret: any;
			secretSnapshot: any;
			serviceToken: any;
			accessToken: any;
			serviceTokenData: any;
			query?: any;
		}
	}
}
