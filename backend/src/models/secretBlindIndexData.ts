import { Schema, model, Types, Document } from 'mongoose';

export interface ISecretBlindIndexData {
    _id: Types.ObjectId;
    workspace: Types.ObjectId;
    encryptedSalt: string;
}

const secretBlindIndexDataSchema = new Schema<ISecretBlindIndexData>(
    {
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true
        },
        encryptedSalt: {
            type: String,
            required: true
        }
    }
);

const SecretBlindIndexData = model<ISecretBlindIndexData>('SecretBlindIndexData', secretBlindIndexDataSchema);

export default SecretBlindIndexData;