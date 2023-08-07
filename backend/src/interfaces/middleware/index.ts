import { Types } from "mongoose";
import {
    IServiceTokenData,
    IUser,
} from "../../models";
import { 
    ServiceActor,
    UserActor,
    UserAgentType
} from "../../ee/models";

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

export interface ServiceTokenAuthData extends BaseAuthData {
    actor: ServiceActor;
    authPayload: IServiceTokenData;
}

export type AuthData =
    | UserAuthData
    | ServiceTokenAuthData;