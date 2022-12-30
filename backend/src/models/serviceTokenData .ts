import { Schema, model, Types } from 'mongoose';
import { ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD } from '../variables';

export interface IServiceTokenData {
    name: string;
    workspace: Types.ObjectId;
    environment: string; // TODO: adapt to upcoming environment id
    expiresAt: Date;
    prefix: string;
    serviceTokenHash: string;
    encryptedKey: string;
    iv: string;
    tag: string;
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
        environment: { // TODO: adapt to upcoming environment id
            type: String,
            required: true
        },
        expiresAt: {
            type: Date
        },
        prefix: {
            type: String,
            required: true
        },
        serviceTokenHash: {
            type: String,
            unique: true,
            required: true
        },
        encryptedKey: {
            type: String,
            select: true
        },
        iv: {
            type: String,
            select: true
        },
        tag: {
            type: String,
            select: true
        }
    }, 
    {
        timestamps: true
    }
);

const ServiceTokenData = model<IServiceTokenData>('ServiceTokenData', serviceTokenDataSchema);
    
export default ServiceTokenData;
