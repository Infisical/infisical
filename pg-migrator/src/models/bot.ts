import { Schema, Types, model } from "mongoose";
import { 
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_BASE64,
    ENCODING_SCHEME_UTF8,
} from "../variables";

export interface IBot {
	_id: Types.ObjectId;
    name: string;
    workspace: Types.ObjectId;
    isActive: boolean;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
    algorithm: "aes-256-gcm";
    keyEncoding: "base64" | "utf8";
}

const botSchema = new Schema<IBot>(
	{
        name: {
            type: String,
            required: true,
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },
        isActive: {
            type: Boolean,
            required: true,
            default: false,
        },
        publicKey: {
            type: String,
            required: true,
        },
        encryptedPrivateKey: {
            type: String,
            required: true,
            select: false,
        },
        iv: {
            type: String,
            required: true,
            select: false,
        },
        tag: {
            type: String,
            required: true,
            select: false,
        },
        algorithm: { // the encryption algorithm used
            type: String,
            enum: [ALGORITHM_AES_256_GCM],
            required: true,
            select: false,
        },
        keyEncoding: {
            type: String,
            enum: [
                ENCODING_SCHEME_UTF8,
                ENCODING_SCHEME_BASE64,
            ],
            required: true,
            select: false,
        },
	},
	{
		timestamps: true,
	}
);

export const Bot = model<IBot>("Bot", botSchema);