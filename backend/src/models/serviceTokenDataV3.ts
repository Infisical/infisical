import { Document, Schema, Types, model } from "mongoose";

enum Permission {
    READ = "read",
    READ_WRITE = "readWrite"
}

export interface Scope {
    environment: string;
    secretPath: string;
    permission: Permission;
}

export interface IServiceTokenDataV3 extends Document {
    _id: Types.ObjectId;
    name: string;
    workspace: Types.ObjectId;
    publicKey: string;
    isActive: boolean;
    lastUsed?: Date;
    expiresAt?: Date;
    scopes: Array<Scope>;
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
        },
        expiresAt: {
            type: Date,
            required: false,
            expires: 0
        },
        scopes: {
            type: [
                {
                    environment: {
                        type: String,
                        required: true
                    },
                    secretPath: {
                        type: String,
                        default: "/",
                        required: true
                    },
                    permission: {
                        type: String,
                        enum: [Permission.READ, Permission.READ_WRITE],
                        required: true
                    }
                }
            ],
            required: true
        }
    },
    {
        timestamps: true
    }
);

export const ServiceTokenDataV3 = model<IServiceTokenDataV3>("ServiceTokenDataV3", serviceTokenDataV3Schema);