import { Schema, Types, model } from "mongoose";

export interface IBotKey {
	_id: Types.ObjectId;
	encryptedKey: string;
	nonce: string;
	sender: Types.ObjectId;
	bot: Types.ObjectId;
	workspace: Types.ObjectId;
}

const botKeySchema = new Schema<IBotKey>(
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
		bot: {
			type: Schema.Types.ObjectId,
			ref: "Bot",
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

export const BotKey = model<IBotKey>("BotKey", botKeySchema);