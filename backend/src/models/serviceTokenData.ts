import { Schema, model, Types, Document } from 'mongoose';

export interface IServiceTokenData extends Document {
    _id: Types.ObjectId;
    name: string;
    workspace: Types.ObjectId;
    environment: string;
    user: Types.ObjectId;
    serviceAccount: Types.ObjectId;
    lastUsed: Date;
    expiresAt: Date;
    secretHash: string;
    encryptedKey: string;
    iv: string;
    tag: string;
    permissions: string[];
}

const serviceTokenDataSchema = new Schema<IServiceTokenData>(
    {
        name: {
            type: String,
            required: true
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true
        },
        environment: {
            type: String,
            required: true
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: 'ServiceAccount'
        },
        lastUsed: {
            type: Date
        },
        expiresAt: {
            type: Date
        },
        secretHash: {
            type: String,
            required: true,
            select: false
        },
        encryptedKey: {
            type: String,
            select: false
        },
        iv: {
            type: String,
            select: false
        },
        tag: {
            type: String,
            select: false
        },
        permissions: {
            type: [String],
            enum: ['read', 'write'],
            default: ['read']
        }
    }, 
    {
        timestamps: true
    }
);

const ServiceTokenData = model<IServiceTokenData>('ServiceTokenData', serviceTokenDataSchema);
    
export default ServiceTokenData;
