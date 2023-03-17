import { Schema, model, Types, Document } from 'mongoose';

export interface IServiceAccount extends Document {
    _id: Types.ObjectId;
    name: string;
    isActive: boolean;
    organization: Types.ObjectId;
    createdBy: Types.ObjectId;
    publicKey: string;
    expiresAt: Date;
}

const serviceAccountSchema = new Schema<IServiceAccount>(
    {
        name: {
            type: String,
            required: true
        },
        isActive: {
            type: Boolean,
            required: true
        },
        organization: {
            type: Schema.Types.ObjectId,
            ref: 'Organization',
            required: true
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        publicKey: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

const ServiceAccount = model<IServiceAccount>('ServiceAcount', serviceAccountSchema);

export default ServiceAccount;