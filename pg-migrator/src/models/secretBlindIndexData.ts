import { Document, Schema, Types, model } from "mongoose";
import {
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_BASE64,
    ENCODING_SCHEME_UTF8,
} from "../variables";

export interface ISecretBlindIndexData extends Document {
    _id: Types.ObjectId;
    workspace: Types.ObjectId;
    encryptedSaltCiphertext: string;
    saltIV: string;
    saltTag: string;
    algorithm: "aes-256-gcm";
    keyEncoding: "base64" | "utf8"
}

const secretBlindIndexDataSchema = new Schema<ISecretBlindIndexData>(
    {
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },
        encryptedSaltCiphertext: { // TODO: make these select: false
            type: String,
            required: true,
        },
        saltIV: {
            type: String,
            required: true,
        },
        saltTag: {
            type: String,
            required: true,
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

secretBlindIndexDataSchema.index({ workspace: 1 });

export const SecretBlindIndexData = model<ISecretBlindIndexData>("SecretBlindIndexData", secretBlindIndexDataSchema);