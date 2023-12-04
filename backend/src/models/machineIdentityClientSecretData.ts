import { Document, Schema, Types, model } from "mongoose";

export interface IMachineIdentityClientSecretData extends Document {
    _id: Types.ObjectId;
    machineIdentity: Types.ObjectId;
    isActive: boolean;
    description: string;
    clientSecretPrefix: string;
    clientSecretHash: string;
    clientSecretLastUsed?: Date;
    clientSecretUsageCount: number;
    clientSecretUsageLimit: number;
    accessTokenVersion: number;
    expiresAt?: Date;
}

const machineIdentityClientSecretDataSchema = new Schema(
    {
        machineIdentity: {
            type: Schema.Types.ObjectId,
            ref: "MachineIdentity",
            required: true
        },
        isActive: {
            type: Boolean,
            default: true,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        clientSecretPrefix: {
            type: String,
            required: true
        },
        clientSecretHash: {
            type: String,
            required: true
        },
        clientSecretLastUsed: {
            type: Date,
            required: false
        },
        clientSecretUsageCount: {
            // number of times client secret has been used
            // in login operation
            type: Number,
            default: 0,
            required: true
        },
        clientSecretUsageLimit: {
            // number of times client secret can be used for
            // a login operation
            type: Number,
            default: 0, // default: used as many times as needed
            required: true
        },
        accessTokenVersion: {
            type: Number,
            default: 1,
            required: true
        },
        expiresAt: {
            type: Date,
            required: false
        }
    },
    {
        timestamps: true
    }
);

export const MachineIdentityClientSecretData = model<IMachineIdentityClientSecretData>("MachineIdentityClientSecretData", machineIdentityClientSecretDataSchema);