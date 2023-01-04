import { Schema, model, Types } from 'mongoose';

export interface IAPIKeyData {
    name: string;
    user: Types.ObjectId;
    expiresAt: Date;
    secretHash: string;
}

const apiKeyDataSchema = new Schema<IAPIKeyData>(
    {
        name: {
            type: String,
            required: true
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
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

const APIKeyData = model<IAPIKeyData>('APIKeyData', apiKeyDataSchema);

export default APIKeyData;
