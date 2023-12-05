import { Document, Schema, Types, model } from "mongoose";

export interface IMachineIdentityClientSecret extends Document {
    _id: Types.ObjectId;
    machineIdentity: Types.ObjectId;
    isActive: boolean;
    description: string;
    clientSecretPrefix: string;
    clientSecretHash: string;
    clientSecretLastUsed?: Date;
    clientSecretNumUses: number;
    clientSecretNumUsesLimit: number;
    clientSecretTTL: number;
    accessTokenVersion: number;
    updatedAt: Date;
    createdAt: Date;
}

const machineIdentityClientSecretSchema = new Schema(
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
        clientSecretNumUses: {
            // number of times client secret has been used
            // in login operation
            type: Number,
            default: 0,
            required: true
        },
        clientSecretNumUsesLimit: {
            // number of times client secret can be used for
            // a login operation
            type: Number,
            default: 0, // default: used as many times as needed
            required: true
        },
        clientSecretTTL: {
            type: Number,
            default: 0, // default: does not expire
            required: true
        },
        accessTokenVersion: {
            type: Number,
            default: 1,
            required: true
        },
    },
    {
        timestamps: true
    }
);

machineIdentityClientSecretSchema.index(
    { machineIdentity: 1, isActive: 1 }
)

export const MachineIdentityClientSecret = model<IMachineIdentityClientSecret>("MachineIdentityClientSecret", machineIdentityClientSecretSchema);