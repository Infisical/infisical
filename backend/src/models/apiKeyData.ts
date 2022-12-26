import { Schema, model, Types } from 'mongoose';
import { ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD } from '../variables';

export interface IAPIKeyData {
    name: string;
    workspaces: { 
        workspace: Types.ObjectId,
        environments: string[]
    }[];
    expiresAt: Date;
    prefix: string;
    apiKeyHash: string;
    encryptedKey: string;
    iv: string;
    tag: string;
}

const apiKeyDataSchema = new Schema<IAPIKeyData>(
    {
        name: {
            type: String,
            required: true
        },
        workspaces: [{
            workspace: {
                type: Schema.Types.ObjectId,
                ref: 'Workspace'
            },
            environments: [{
                type: String,
                enum: [ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD]
            }]
        }],
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

const APIKeyData = model<IAPIKeyData>('APIKeyData', apiKeyDataSchema);
    
export default APIKeyData;
