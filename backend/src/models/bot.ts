import { Schema, model, Types } from 'mongoose';

export interface IBot {
	_id: Types.ObjectId;
    name: string;
    workspace: Types.ObjectId;
    isActive: boolean;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
}

const botSchema = new Schema<IBot>(
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
        isActive: {
            type: Boolean,
            required: true,
            default: false
        },
        publicKey: {
            type: String,
            required: true
        },
        encryptedPrivateKey: {
            type: String,
            required: true,
            select: false
        },
        iv: {
            type: String,
            required: true,
            select: false
        },
        tag: {
            type: String,
            required: true,
            select: false
        }
	},
	{
		timestamps: true
	}
);

const Bot = model<IBot>('Bot', botSchema);

export default Bot;
