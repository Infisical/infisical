import { Schema, model, Types, Document } from 'mongoose';

export interface IServiceAccountOrganizationPermission extends Document {
    _id: Types.ObjectId;
    serviceAccount: Types.ObjectId;
}

const serviceAccountOrganizationPermissionSchema = new Schema<IServiceAccountOrganizationPermission>(
    {
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: 'ServiceAccount',
            required: true
        }
    },
    {
        timestamps: true
    }
);

const ServiceAccountOrganizationPermission = model<IServiceAccountOrganizationPermission>('ServiceAccountOrganizationPermission', serviceAccountOrganizationPermissionSchema);

export default ServiceAccountOrganizationPermission;