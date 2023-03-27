import { Schema, model, Types, Document } from 'mongoose';

export interface IServiceAccount extends Document {
    _id: Types.ObjectId;
    name: string;
    organization: Types.ObjectId;
    user: Types.ObjectId;
    publicKey: string;
    expiresAt: Date;
    secretHash: string;
}

const serviceAccountSchema = new Schema<IServiceAccount>(
    {
        name: {
            type: String,
            required: true
        },
        organization: {
            type: Schema.Types.ObjectId,
            ref: 'Organization',
            required: true
        },
        user: { // user who created the service account
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
        },
        secretHash: {
            type: String,
            required: true,
            select: false
        }
    },
    {
        timestamps: true
    }
);

const ServiceAccount = model<IServiceAccount>('ServiceAcount', serviceAccountSchema);

export default ServiceAccount;