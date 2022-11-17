import { Schema, model, Types } from 'mongoose';

export interface IUserAction {
	_id: Types.ObjectId;
	user: Types.ObjectId;
	action: string;
}

const userActionSchema = new Schema<IUserAction>(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true
		},
		action: {
			type: String,
			required: true
		}
	},
	{
		timestamps: true
	}
);

const UserAction = model<IUserAction>('UserAction', userActionSchema);

export default UserAction;
