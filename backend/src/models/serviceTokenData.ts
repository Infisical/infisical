import { Schema, model, Types } from 'mongoose';

export interface IServiceTokenData {
    name: string;
    workspace: Types.ObjectId;
    environment: string; // TODO: adapt to upcoming environment id
    user: Types.ObjectId;
    expiresAt: Date;
    secretHash: string;
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
        }
    }, 
    {
        timestamps: true
    }
);

const ServiceTokenData = model<IServiceTokenData>('ServiceTokenData', serviceTokenDataSchema);
    
export default ServiceTokenData;
