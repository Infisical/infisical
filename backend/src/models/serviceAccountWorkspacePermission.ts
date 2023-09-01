import { Document, Schema, Types, model } from "mongoose";

export interface IServiceAccountWorkspacePermission extends Document {
    _id: Types.ObjectId;
    serviceAccount: Types.ObjectId;
    workspace: Types.ObjectId;
    environment: string;
    read: boolean;
    write: boolean;
}

const serviceAccountWorkspacePermissionSchema = new Schema<IServiceAccountWorkspacePermission>(
    {
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: "ServiceAccount",
            required: true,
        },
        workspace:{
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },
        environment: {
            type: String,
            required: true,
        },
        read: {
            type: Boolean,
            default: false,
        },
        write: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

export const ServiceAccountWorkspacePermission = model<IServiceAccountWorkspacePermission>("ServiceAccountWorkspacePermission", serviceAccountWorkspacePermissionSchema);