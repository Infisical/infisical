import { Types } from "mongoose";
import {
	AuthData
} from "../../interfaces/middleware";

declare module "express" {
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
			isUserCompleted: boolean;
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
			accessToken: any;
			accessId: any;
			serviceTokenData: any;
			apiKeyData: any;
			query?: any;
			tokenVersionId?: Types.ObjectId;
			authData: AuthData;
			realIP: string;
			requestData: {
				[key: string]: string
			};
		}
	}
}
