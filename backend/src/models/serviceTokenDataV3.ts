import { Document, Schema, Types, model } from "mongoose";

export interface IServiceTokenDataV3 extends Document {
    _id: Types.ObjectId;
    name: string;
    workspace: Types.ObjectId;
    publicKey: string;
    isActive: boolean;
    lastUsed: Date;
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
        publicKey: {
            type: String,
            required: true
        },
        isActive: {
            type: Boolean,
            required: true
        },
        lastUsed: {
            type: Date,
            required: false
        }
    },
    {
        timestamps: true
    }
);

export const ServiceTokenDataV3 = model<IServiceTokenDataV3>("ServiceTokenDataV3", serviceTokenDataV3Schema);