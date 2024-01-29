import { Schema, Types, model } from "mongoose";

export interface IUserAction {
	_id: Types.ObjectId;
	user: Types.ObjectId;
	action: string;
}

const userActionSchema = new Schema<IUserAction>(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		action: {
			type: String,
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

export const UserAction = model<IUserAction>("UserAction", userActionSchema);