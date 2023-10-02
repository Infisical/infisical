import { Document, Schema, Types, model } from "mongoose";
import { 
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_BASE64,
    ENCODING_SCHEME_UTF8,
} from "../variables";

export interface IGitSecretBlindIndexData extends Document {
    _id: Types.ObjectId;
    organizationId: string;
    encryptedSaltCiphertext: string;
    saltIV: string;
    saltTag: string;
    algorithm: "aes-256-gcm";
    keyEncoding: "base64" | "utf8"
}

const gitSecretBlindIndexDataSchema = new Schema<IGitSecretBlindIndexData>(
    {
        organizationId: {
            type: String,
            required: true,
        },
        encryptedSaltCiphertext: { 
            type: String,
            required: true,
            select: false,
        },
        saltIV: {
            type: String,
            required: true,
            select: false,
        },
        saltTag: {
            type: String,
            required: true,
            select: false,
        },
        algorithm: {
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

    }
);

export const GitSecretBlindIndexData = model<IGitSecretBlindIndexData>("GitSecretBlindIndexData", gitSecretBlindIndexDataSchema);