import { Document, Schema, Types, model } from "mongoose";

export interface IServiceTokenDataV3Key extends Document {
	_id: Types.ObjectId;
	encryptedKey: string;
	nonce: string;
    sender: Types.ObjectId;
    serviceTokenData: Types.ObjectId;
	workspace: Types.ObjectId;
}

const serviceTokenDataV3KeySchema = new Schema(
    {
        encryptedKey: {
            type: String,
            required: true
        },
        nonce: {
            type: String,
            required: true
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        serviceTokenData: {
			type: Schema.Types.ObjectId,
			ref: "ServiceTokenDataV3",
			required: true,
        },
		workspace: {
			type: Schema.Types.ObjectId,
			ref: "Workspace",
			required: true,
		}
    },
    {
        timestamps: true
    }
);

export const ServiceTokenDataV3Key = model<IServiceTokenDataV3Key>("ServiceTokenDataV3Key", serviceTokenDataV3KeySchema);