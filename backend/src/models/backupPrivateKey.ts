import { Schema, Types, model } from "mongoose";
import { 
	ALGORITHM_AES_256_GCM,
	ENCODING_SCHEME_BASE64,
	ENCODING_SCHEME_UTF8,
} from "../variables";

export interface IBackupPrivateKey {
	_id: Types.ObjectId;
	user: Types.ObjectId;
	encryptedPrivateKey: string;
	iv: string;
	tag: string;
	salt: string;
	algorithm: string;
	keyEncoding: "base64" | "utf8";
	verifier: string;
}

const backupPrivateKeySchema = new Schema<IBackupPrivateKey>(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		encryptedPrivateKey: {
			type: String,
			select: false,
			required: true,
		},
		iv: {
			type: String,
			select: false,
			required: true,
		},
		tag: {
			type: String,
			select: false,
			required: true,
		},
        algorithm: { // the encryption algorithm used
            type: String,
            enum: [ALGORITHM_AES_256_GCM],
            required: true,
        },
        keyEncoding: {
            type: String,
            enum: [
                ENCODING_SCHEME_UTF8,
                ENCODING_SCHEME_BASE64,
            ],
			required: true,
        },
		salt: {
			type: String,
			select: false,
			required: true,
		},
		verifier: {
			type: String,
			select: false,
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

export const BackupPrivateKey = model<IBackupPrivateKey>(
	"BackupPrivateKey",
	backupPrivateKeySchema
);
