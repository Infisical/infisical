import { Document, Schema, Types, model } from "mongoose";
import { IPType } from "../ee/models";
import { ADMIN, CUSTOM, MEMBER, VIEWER } from "../variables";

export interface IServiceTokenV3TrustedIp {
    ipAddress: string;
    type: IPType;
    prefix: number;
}

export interface IServiceTokenDataV3 extends Document {
    _id: Types.ObjectId;
    name: string;
    workspace: Types.ObjectId;
    user: Types.ObjectId;
    publicKey: string;
    isActive: boolean;
    refreshTokenLastUsed?: Date;
    accessTokenLastUsed?: Date;
    refreshTokenUsageCount: number;
    accessTokenUsageCount: number;
    tokenVersion: number;
    isRefreshTokenRotationEnabled: boolean;
    expiresAt?: Date;
    accessTokenTTL: number;
    role: "admin" | "member" | "viewer" | "custom";
    customRole: Types.ObjectId;
    trustedIps: Array<IServiceTokenV3TrustedIp>;
}

const serviceTokenDataV3Schema = new Schema(
    {
        name: {
            type: String,
            required: true
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        publicKey: {
            type: String,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true,
            required: true
        },
        refreshTokenLastUsed: {
            type: Date,
            required: false
        },
        accessTokenLastUsed: {
            type: Date,
            required: false
        },
        refreshTokenUsageCount: {
            type: Number,
            default: 0,
            required: true
        },
        accessTokenUsageCount: {
            type: Number,
            default: 0,
            required: true
        },
        tokenVersion: {
            type: Number,
            default: 1,
            required: true
        },
        isRefreshTokenRotationEnabled: {
            type: Boolean,
            default: false,
            required: true
        },
        expiresAt: { // consider revising field name
            type: Date,
            required: false,
            // expires: 0
        },
        accessTokenTTL: { // seconds
            type: Number,
            default: 7200,
            required: true
        },
        role: {
            type: String,
            enum: [ADMIN, MEMBER, VIEWER, CUSTOM],
            required: true
        },
        customRole: {
            type: Schema.Types.ObjectId,
            ref: "Role"
        },
        trustedIps: {
            type: [
                {
                    ipAddress: {
                        type: String,
                        required: true
                    },
                    type: {
                        type: String,
                        enum: [
                            IPType.IPV4,
                            IPType.IPV6
                        ],
                        required: true
                    },
                    prefix: {
                        type: Number,
                        required: false
                    }
                }
            ],
            default: [{
                ipAddress: "0.0.0.0",
                type: IPType.IPV4.toString(),
                prefix: 0
            }],
            required: true
        }
    },
    {
        timestamps: true
    }
);

export const ServiceTokenDataV3 = model<IServiceTokenDataV3>("ServiceTokenDataV3", serviceTokenDataV3Schema);