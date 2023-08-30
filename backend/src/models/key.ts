import { Schema, Types, model } from "mongoose";

export interface IKey {
	_id: Types.ObjectId;
	encryptedKey: string;
	nonce: string;
	sender: Types.ObjectId;
	receiver: Types.ObjectId;
	workspace: Types.ObjectId;
}

const keySchema = new Schema<IKey>(
	{
		encryptedKey: {
			type: String,
			required: true,
		},
		nonce: {
			type: String,
			required: true,
		},
		sender: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		receiver: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		workspace: {
			type: Schema.Types.ObjectId,
			ref: "Workspace",
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

export const Key = model<IKey>("Key", keySchema);