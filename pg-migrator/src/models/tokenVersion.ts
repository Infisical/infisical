import { Document, Schema, Types, model } from "mongoose";

export interface ITokenVersion extends Document {
    user: Types.ObjectId;
    ip: string;
    userAgent: string;
    refreshVersion: number;
    accessVersion: number;
    lastUsed: Date;
}

const tokenVersionSchema = new Schema<ITokenVersion>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        ip: {
            type: String,
            required: true,
        },
        userAgent: {
            type: String,
            required: true,
        },
        refreshVersion: {
            type: Number,
            required: true,
        },
        accessVersion: {
            type: Number,
            required: true,
        },
        lastUsed: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export const TokenVersion = model<ITokenVersion>("TokenVersion", tokenVersionSchema);