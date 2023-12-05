import { Document, Schema, Types, model } from "mongoose";
import { boolean } from "zod";

export interface IMachineIdentityAccessToken extends Document {
    _id: Types.ObjectId;
    machineIdentityClientSecret: Types.ObjectId;
    isActive: boolean;
    accessTokenLastUsed?: Date;
    accessTokenNumUses: number;
    accessTokenNumUsesLimit: number;
    accessTokenTTL: number;
    accessTokenVersion: number;
    renewable: boolean;
    updatedAt: Date;
    createdAt: Date;
}

const machineIdentityAccessTokenSchema = new Schema(
    {
        machineIdentityClientSecret: {
            type: Schema.Types.ObjectId,
            ref: "MachineIdentityClientSecret",
            required: true
        },
        isActive: {
            type: Boolean,
            default: true,
            required: true
        },
        accessTokenLastUsed: {
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
        accessTokenTTL: {
            type: Number,
            default: 0, // default: does not expire
            required: true
        },
        renewable: {
            type: boolean,
            default: false, // no refresh mechanism yet
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

machineIdentityAccessTokenSchema.index(
    { machineIdentityClientSecret: 1, isActive: 1 }
)

export const MachineIdentityClientSecret = model<IMachineIdentityAccessToken>("MachineIdentityAccessToken", machineIdentityAccessTokenSchema);