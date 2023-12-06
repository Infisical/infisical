import { Document, Schema, Types, model } from "mongoose";

export interface IIdentityAccessToken extends Document {
    _id: Types.ObjectId;
    machineIdentity?: Types.ObjectId;
    machineIdentityClientSecret?: Types.ObjectId;
    accessTokenLastUsedAt?: Date;
    accessTokenLastRenewedAt?: Date;
    accessTokenNumUses: number;
    accessTokenNumUsesLimit: number;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    isAccessTokenRevoked: boolean;
    updatedAt: Date;
    createdAt: Date;
}

const identityAccessTokenSchema = new Schema(
    {
        machineIdentity: {
            type: Schema.Types.ObjectId,
            ref: "MachineIdentity",
            required: false
        },
        machineIdentityClientSecret: {
            type: Schema.Types.ObjectId,
            ref: "MachineIdentityClientSecret",
            required: false
        },
        accessTokenLastUsedAt: {
            type: Date,
            required: false
        },
        accessTokenLastRenewedAt: {
            type: Date,
            required: false
        },
        accessTokenNumUses: {
            // number of times access token has been used
            type: Number,
            default: 0,
            required: true
        },
        accessTokenNumUsesLimit: {
            // number of times access token can be used for
            type: Number,
            default: 0, // default: used as many times as needed
            required: true
        },
        accessTokenTTL: { // seconds
            // incremental lifetime
            type: Number,
            default: 7200,
            required: true
        },
        accessTokenMaxTTL: { // seconds
            // max lifetime
            type: Number,
            default: 7200,
            required: true
        },
        isAccessTokenRevoked: {
            type: Boolean,
            default: false,
            required: true
        },
    },
    {
        timestamps: true
    }
);

export const IdentityAccessToken = model<IIdentityAccessToken>("IdentityAccessToken", identityAccessTokenSchema);