import { Document, Schema, Types, model } from "mongoose";
import { IPType } from "../ee/models";

export interface IMachineIdentityTrustedIp {
    ipAddress: string;
    type: IPType;
    prefix: number;
}

// TODO: rename to AppClient

export interface IMachineIdentity extends Document {
    _id: Types.ObjectId;
    clientId: string;
    name: string;
    organization: Types.ObjectId;
    isActive: boolean;
    accessTokenTTL: number;
    accessTokenLastUsed?: Date;
    accessTokenUsageCount: number;
    clientSecretTrustedIps: Array<IMachineIdentityTrustedIp>;
    accessTokenTrustedIps: Array<IMachineIdentityTrustedIp>;
}

const machineIdentitySchema = new Schema(
    {
        clientId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true
        },
        isActive: {
            type: Boolean,
            default: true,
            required: true
        },
        accessTokenTTL: { // seconds
            type: Number,
            default: 7200,
            required: true
        },
        accessTokenLastUsed: {
            type: Date,
            required: false
        },
        accessTokenUsageCount: {
            type: Number,
            default: 0,
            required: true
        },
        clientSecretTrustedIps: {
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
        },
        accessTokenTrustedIps: {
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

machineIdentitySchema.index({ clientId: 1, isActive: 1 })

export const MachineIdentity = model<IMachineIdentity>("MachineIdentity", machineIdentitySchema);