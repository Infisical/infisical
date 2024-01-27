import { Document, Schema, Types, model } from "mongoose";

export interface IAPIKeyDataV2 extends Document {
    _id: Types.ObjectId;
    name: string;
    user: Types.ObjectId;
    lastUsed?: Date
    usageCount: number;
    expiresAt?: Date;
}

const apiKeyDataV2Schema  = new Schema(
    {
        name: {
            type: String,
            required: true
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        lastUsed: {
            type: Date,
            required: false
        },
        usageCount: {
            type: Number,
            default: 0,
            required: true
        }
    },
    {
        timestamps: true
    }
);

export const APIKeyDataV2 = model<IAPIKeyDataV2>("APIKeyDataV2", apiKeyDataV2Schema);