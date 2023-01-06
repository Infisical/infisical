import { Schema, model, Types } from 'mongoose';
import {
	SECRET_SHARED,
	SECRET_PERSONAL,
	ENV_DEV,
	ENV_TESTING,
	ENV_STAGING,
	ENV_PROD
} from '../../variables';

/**
 * TODO: 
 * 1. Modify SecretVersion to also contain XX
 * - type
 * - user
 * - environment
 * 2. Modify SecretSnapshot to point to arrays of SecretVersion
 */

export interface ISecretVersion {
    _id?: Types.ObjectId;
    secret: Types.ObjectId;
    version: number;
	workspace: Types.ObjectId; // new
	type: string; // new
	user: Types.ObjectId; // new
	environment: string; // new
    isDeleted: boolean;
    secretKeyCiphertext: string;
	secretKeyIV: string;
	secretKeyTag: string;
	secretKeyHash: string;
	secretValueCiphertext: string;
	secretValueIV: string;
	secretValueTag: string;
	secretValueHash: string;
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
			enum: [ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD],
			required: true
		},
        isDeleted: {
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

const SecretVersion = model<ISecretVersion>('SecretVersion', secretVersionSchema);

export default SecretVersion;