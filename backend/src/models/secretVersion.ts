import { Schema, model, Types } from 'mongoose';

export interface ISecretVersion {
    _id: Types.ObjectId;
    secret: Types.ObjectId;
    version: number;
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