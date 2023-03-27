import { Schema, model, Types, Document } from 'mongoose';

export interface IServiceAccountOrganizationPermissions extends Document {
    _id: Types.ObjectId;
    serviceAccount: Types.ObjectId;
    canFoo: boolean;
}

const serviceAccountOrganizationPermissionsSchema = new Schema<IServiceAccountOrganizationPermissions>(
    {
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: 'ServiceAccount',
            required: true
        },
        canFoo: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

const ServiceAccountOrganizationPermissions = model<IServiceAccountOrganizationPermissions>('ServiceAccountOrganizationPermissions', serviceAccountOrganizationPermissionsSchema);

export default ServiceAccountOrganizationPermissions;