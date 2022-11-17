import { Schema, model, Types } from 'mongoose';
import { ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD } from '../variables';

export interface IServiceToken {
	_id: Types.ObjectId;
	name: string;
	user: Types.ObjectId;
	workspace: Types.ObjectId;
	environment: string;
	expiresAt: Date;
	publicKey: string;
	encryptedKey: string;
	nonce: string;
}

const serviceTokenSchema = new Schema<IServiceToken>(
	{
		name: {
			type: String,
			required: true
		},
		user: {
			// token issuer
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true
		},
		workspace: {
			type: Schema.Types.ObjectId,
			ref: 'Workspace',
			required: true
		},
		environment: {
			type: String,
			enum: [ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD],
			required: true
		},
		expiresAt: {
			type: Date
		},
		publicKey: {
			type: String,
			required: true,
			select: true
		},
		encryptedKey: {
			type: String,
			required: true,
			select: true
		},
		nonce: {
			type: String,
			required: true,
			select: true
		}
	},
	{
		timestamps: true
	}
);

const ServiceToken = model<IServiceToken>('ServiceToken', serviceTokenSchema);

export default ServiceToken;
