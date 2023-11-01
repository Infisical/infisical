import { Types } from "mongoose";
import { IServiceTokenData, IServiceTokenDataV3, IUser } from "../../models";
import { ServiceActor, ServiceActorV3, UserActor, UserAgentType } from "../../ee/models";

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

export interface ServiceTokenV3AuthData extends BaseAuthData {
  actor: ServiceActorV3;
  authPayload: IServiceTokenDataV3;
}

export interface ServiceTokenAuthData extends BaseAuthData {
  actor: ServiceActor;
  authPayload: IServiceTokenData;
}

export type AuthData = UserAuthData | ServiceTokenV3AuthData | ServiceTokenAuthData;
