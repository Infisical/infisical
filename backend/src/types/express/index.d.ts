import * as express from 'express';

// TODO: fix (any) types
declare global {
	namespace Express {
		interface Request {
			user: any;
			workspace: any;
			membership: any;
			organizationt: any;
			membershipOrg: any;
			integration: any;
			integrationAuth: any;
			serviceToken: any;
			accessToken: any;
			query?: any;
		}
	}
}
