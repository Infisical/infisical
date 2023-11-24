import { Types } from "mongoose";
import { IMachineIdentity, IServiceTokenData, IUser } from "../../models";
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

export interface MachineIdentityAuthData extends BaseAuthData {
  actor: ServiceActorV3;
  authPayload: IMachineIdentity;
}

export interface ServiceTokenAuthData extends BaseAuthData {
  actor: ServiceActor;
  authPayload: IServiceTokenData;
}

export type AuthData = UserAuthData | MachineIdentityAuthData | ServiceTokenAuthData;
