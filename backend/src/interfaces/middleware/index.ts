import { Types } from "mongoose";
import {
    IServiceAccount,
    IServiceTokenData,
    IUser,
} from "../../models";

export interface AuthData {
    authMode: string;
    authPayload: IUser | IServiceAccount | IServiceTokenData;
    authChannel: string;
    authIP: string;
    authUserAgent: string;
    tokenVersionId?: Types.ObjectId;
}