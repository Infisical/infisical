import { Schema, model, Types, Document } from 'mongoose';

export interface IServiceAccountPermission extends Document {
    _id: Types.ObjectId;
    serviceAccount: Types.ObjectId;
    name: string;
    workspace?: Types.ObjectId;
    environment?: string;
}

const serviceAccountPermissionSchema = new Schema<IServiceAccountPermission>(
    {
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: 'ServiceAccount',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace',
            default: null
        },
        environment: {
            type: 'String',
            default: null
        }
    },
    {
        timestamps: true
    }
);

const ServiceAccountPermission = model<IServiceAccountPermission>('ServiceAccountPermission', serviceAccountPermissionSchema);

export default ServiceAccountPermission;