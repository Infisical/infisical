import { Schema, model, Types } from 'mongoose';

export interface IBackupPrivateKey {
	_id: Types.ObjectId;
	user: Types.ObjectId;
	encryptedPrivateKey: string;
	iv: string;
	tag: string;
	salt: string;
	verifier: string;
}

const backupPrivateKeySchema = new Schema<IBackupPrivateKey>(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true
		},
		encryptedPrivateKey: {
			type: String,
			select: false,
			required: true
		},
		iv: {
			type: String,
			select: false,
			required: true
		},
		tag: {
			type: String,
			select: false,
			required: true
		},
		salt: {
			type: String,
			select: false,
			required: true
		},
		verifier: {
			type: String,
			select: false,
			required: true
		}
	},
	{
		timestamps: true
	}
);

const BackupPrivateKey = model<IBackupPrivateKey>(
	'BackupPrivateKey',
	backupPrivateKeySchema
);

export default BackupPrivateKey;
