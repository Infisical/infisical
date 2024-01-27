import { Document, Schema, Types, model } from "mongoose";

export interface IIdentityUniversalAuthClientSecret extends Document {
    _id: Types.ObjectId;
    identity: Types.ObjectId;
    identityUniversalAuth : Types.ObjectId;
    description: string;
    clientSecretPrefix: string;
    clientSecretHash: string;
    clientSecretLastUsedAt?: Date;
    clientSecretNumUses: number;
    clientSecretNumUsesLimit: number;
    clientSecretTTL: number;
    updatedAt: Date;
    createdAt: Date;
    isClientSecretRevoked: boolean;
}

const identityUniversalAuthClientSecretSchema = new Schema(
    {
        identity: {
            type: Schema.Types.ObjectId,
            ref: "Identity",
            required: true
        },
        identityUniversalAuth: {
            type: Schema.Types.ObjectId,
            ref: "IdentityUniversalAuth",
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
        clientSecretLastUsedAt: {
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
        isClientSecretRevoked: {
            type: Boolean,
            default: false,
            required: true
        }
    },
    {
        timestamps: true
    }
);

identityUniversalAuthClientSecretSchema.index(
    { identityUniversalAuth: 1, isClientSecretRevoked: 1 }
);

export const IdentityUniversalAuthClientSecret = model<IIdentityUniversalAuthClientSecret>("IdentityUniversalAuthClientSecret", identityUniversalAuthClientSecretSchema);