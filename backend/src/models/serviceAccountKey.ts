import { Schema, Types, model } from "mongoose";

export interface IServiceAccountKey {
    _id: Types.ObjectId;
    encryptedKey: string;
    nonce: string;
    sender: Types.ObjectId;
    serviceAccount: Types.ObjectId;
    workspace: Types.ObjectId;
}

const serviceAccountKeySchema = new Schema<IServiceAccountKey>(
    {
        encryptedKey: {
            type: String,
            required: true,
        },
        nonce: {
            type: String,
            required: true,
        },
        sender: {
            type: Schema.Types.ObjectId,
            required: true,
        },
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: "ServiceAccount",
            required: true,
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export const ServiceAccountKey = model<IServiceAccountKey>("ServiceAccountKey", serviceAccountKeySchema);