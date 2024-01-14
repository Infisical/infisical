import { Schema, Types, model } from "mongoose";
import { 
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_BASE64,
    ENCODING_SCHEME_UTF8,
} from "../variables";

export interface IBotOrg {
	_id: Types.ObjectId;
    name: string;
    organization: Types.ObjectId;
    publicKey: string;
    encryptedSymmetricKey: string;
    symmetricKeyIV: string;
    symmetricKeyTag: string;
    symmetricKeyAlgorithm: "aes-256-gcm";
    symmetricKeyKeyEncoding: "base64" | "utf8";
    encryptedPrivateKey: string;
    privateKeyIV: string;
    privateKeyTag: string;
    privateKeyAlgorithm: "aes-256-gcm";
    privateKeyKeyEncoding: "base64" | "utf8";
}

const botOrgSchema = new Schema<IBotOrg>(
	{
        name: {
            type: String,
            required: true,
        },
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        publicKey: {
            type: String,
            required: true,
        },
        encryptedSymmetricKey: {
            type: String,
            required: true
        },
        symmetricKeyIV: {
            type: String,
            required: true
        },
        symmetricKeyTag: {
            type: String,
            required: true
        },
        symmetricKeyAlgorithm: {
            type: String,
            enum: [ALGORITHM_AES_256_GCM],
            required: true
        },
        symmetricKeyKeyEncoding: {
            type: String,
            enum: [
                ENCODING_SCHEME_UTF8,
                ENCODING_SCHEME_BASE64,
            ],
            required: true
        },
        encryptedPrivateKey: {
            type: String,
            required: true
        },
        privateKeyIV: {
            type: String,
            required: true
        },
        privateKeyTag: {
            type: String,
            required: true
        },
        privateKeyAlgorithm: {
            type: String,
            enum: [ALGORITHM_AES_256_GCM],
            required: true
        },
        privateKeyKeyEncoding: {
            type: String,
            enum: [
                ENCODING_SCHEME_UTF8,
                ENCODING_SCHEME_BASE64,
            ],
            required: true
        },
	},
	{
		timestamps: true,
	}
);

export const BotOrg = model<IBotOrg>("BotOrg", botOrgSchema);