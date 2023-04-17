import { Schema, model, Types, Document } from 'mongoose';

export interface ISecretBlindIndexData {
    _id: Types.ObjectId;
    workspace: Types.ObjectId;
    encryptedSaltCiphertext: string;
    saltIV: string;
    saltTag: string;
}

const secretBlindIndexDataSchema = new Schema<ISecretBlindIndexData>(
    {
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true
        },
        encryptedSaltCiphertext: {
            type: String,
            required: true
        },
        saltIV: {
            type: String,
            required: true
        },
        saltTag: {
            type: String,
            required: true
        }
    }
);

const SecretBlindIndexData = model<ISecretBlindIndexData>('SecretBlindIndexData', secretBlindIndexDataSchema);

export default SecretBlindIndexData;