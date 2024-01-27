import { Types } from "mongoose";
import { IIdentity, IServiceTokenData, IUser } from "../../models";
import { IdentityActor, ServiceActor, UserActor, UserAgentType } from "../../ee/models";

interface BaseAuthData {
  ipAddress: string;
  userAgent: string;
  userAgentType: UserAgentType;
  tokenVersionId?: Types.ObjectId;
}

export interface UserAuthData extends BaseAuthData {
  actor: UserActor;
  authPayload: IUser;
}

export interface IdentityAuthData extends BaseAuthData {
  actor: IdentityActor;
  authPayload: IIdentity;
}

export interface ServiceTokenAuthData extends BaseAuthData {
  actor: ServiceActor;
  authPayload: IServiceTokenData;
}

export type AuthData = UserAuthData | IdentityAuthData | ServiceTokenAuthData;