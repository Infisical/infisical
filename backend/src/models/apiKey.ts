import { Schema, model, Types } from 'mongoose';
import { ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD } from '../variables';

// TODO: add scopes

export interface IAPIKey {
    name: string;
    workspace: string;
    environment: string;
    expiresAt: Date;
    prefix: string;
    apiKeyHash: string;
    encryptedKey: string;
    iv: string;
    tag: string;
}

const apiKeySchema = new Schema<IAPIKey>(
    {
        name: {
            type: String,
            required: true
        },
        workspace: {
            type: String
        },
        environment: {
            type: String,
            enum: [ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD]
        },
        expiresAt: {
            type: Date
        },
        prefix: {
            type: String,
            required: true
        },
        apiKeyHash: {
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

const APIKey = model<IAPIKey>('APIKey', apiKeySchema);
    
export default APIKey;
