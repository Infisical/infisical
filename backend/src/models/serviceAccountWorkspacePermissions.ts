import { Schema, model, Types, Document } from 'mongoose';

export interface IServiceAccountWorkspacePermissions extends Document {
    _id: Types.ObjectId;
    serviceAccount: Types.ObjectId;
    workspace: Types.ObjectId;
    environment: string;
    canRead: boolean;
    canWrite: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}

const serviceAccountWorkspacePermissions = new Schema<IServiceAccountWorkspacePermissions>(
    {
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: 'ServiceAccount',
            required: true
        },
        workspace:{
            type: Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true
        },
        environment: {
            type: String,
            required: true
        },
        canRead: {
            type: Boolean,
            default: false
        },
        canWrite: {
            type: Boolean,
            default: false
        },
        canUpdate: {
            type: Boolean,
            default: false
        },
        canDelete: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

const ServiceAccountWorkspacePermissions = model<IServiceAccountWorkspacePermissions>('ServiceAccountWorkspacePermissions', serviceAccountWorkspacePermissions);

export default ServiceAccountWorkspacePermissions;