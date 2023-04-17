import { Schema, model, Types } from 'mongoose';
import {
	SECRET_SHARED,
	SECRET_PERSONAL,
} from '../../variables';

export interface ISecretVersion {
	_id: Types.ObjectId;
	secret: Types.ObjectId;
	version: number;
	workspace: Types.ObjectId; // new
	type: string; // new
	user?: Types.ObjectId; // new
	environment: string; // new
	isDeleted: boolean;
	secretKeyCiphertext: string;
	secretKeyIV: string;
	secretKeyTag: string;
	secretValueCiphertext: string;
	secretValueIV: string;
	secretValueTag: string;
}

const secretVersionSchema = new Schema<ISecretVersion>(
	{
		secret: { // could be deleted
			type: Schema.Types.ObjectId,
			ref: 'Secret',
			required: true
		},
		version: {
			type: Number,
			default: 1,
			required: true
		},
		workspace: {
			type: Schema.Types.ObjectId,
			ref: 'Workspace',
			required: true
		},
		type: {
			type: String,
			enum: [SECRET_SHARED, SECRET_PERSONAL],
			required: true
		},
		user: {
			// user associated with the personal secret
			type: Schema.Types.ObjectId,
			ref: 'User'
		},
		environment: {
			type: String,
			required: true
		},
		isDeleted: { // consider removing field
			type: Boolean,
			default: false,
			required: true
		},
		secretKeyCiphertext: {
			type: String,
			required: true
		},
		secretKeyIV: {
			type: String, // symmetric
			required: true
		},
		secretKeyTag: {
			type: String, // symmetric
			required: true
		},
		secretValueCiphertext: {
			type: String,
			required: true
		},
		secretValueIV: {
			type: String, // symmetric
			required: true
		},
		secretValueTag: {
			type: String, // symmetric
			required: true
		}
	},
	{
		timestamps: true
	}
);

const SecretVersion = model<ISecretVersion>('SecretVersion', secretVersionSchema);

export default SecretVersion;