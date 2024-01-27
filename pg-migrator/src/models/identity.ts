import { Document, Schema, Types, model } from "mongoose";
import { IPType } from "../ee/models";

export interface IIdentityTrustedIp {
    ipAddress: string;
    type: IPType;
    prefix: number;
}

export enum IdentityAuthMethod {
    UNIVERSAL_AUTH = "universal-auth"
}

export interface IIdentity extends Document {
    _id: Types.ObjectId;
    name: string;
    authMethod?: IdentityAuthMethod;
}

const identitySchema = new Schema(
    {
        name: {
            type: String,
            required: true
        },
        authMethod: {
            type: String,
            enum: IdentityAuthMethod,
            required: false,
        },
        
    },
    {
        timestamps: true
    }
);

export const Identity = model<IIdentity>("Identity", identitySchema);
