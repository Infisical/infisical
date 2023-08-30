import { Document, Schema, Types, model } from "mongoose";

export interface IServiceAccountOrganizationPermission extends Document {
    _id: Types.ObjectId;
    serviceAccount: Types.ObjectId;
}

const serviceAccountOrganizationPermissionSchema = new Schema<IServiceAccountOrganizationPermission>(
    {
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: "ServiceAccount",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export const ServiceAccountOrganizationPermission = model<IServiceAccountOrganizationPermission>("ServiceAccountOrganizationPermission", serviceAccountOrganizationPermissionSchema);