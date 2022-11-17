import { Schema, model, Types } from 'mongoose';
import {
	SECRET_SHARED,
	SECRET_PERSONAL,
	ENV_DEV,
	ENV_TESTING,
	ENV_STAGING,
	ENV_PROD
} from '../variables';

export interface ISecret {
	_id: Types.ObjectId;
	workspace: Types.ObjectId;
	type: string;
	user: Types.ObjectId;
	environment: string;
	secretKeyCiphertext: string;
	secretKeyIV: string;
	secretKeyTag: string;
	secretKeyHash: string;
	secretValueCiphertext: string;
	secretValueIV: string;
	secretValueTag: string;
	secretValueHash: string;
}

const secretSchema = new Schema<ISecret>(
	{
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
			enum: [ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD],
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
		secretKeyHash: {
			type: String,
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
		},
		secretValueHash: {
			type: String,
			required: true
		}
	},
	{
		timestamps: true
	}
);

const Secret = model<ISecret>('Secret', secretSchema);

export default Secret;
