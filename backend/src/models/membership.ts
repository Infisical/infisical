import { Schema, model, Types } from 'mongoose';
import { ADMIN, MEMBER, INVITED, COMPLETED, GRANTED } from '../variables';

export interface IMembership {
	_id: Types.ObjectId;
	user: Types.ObjectId;
	inviteEmail?: string;
	workspace: Types.ObjectId;
	role: 'admin' | 'member';
	status: 'invited' | 'completed' | 'granted';
}

const membershipSchema = new Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User'
		},
		inviteEmail: {
			type: String
		},
		workspace: {
			type: Schema.Types.ObjectId,
			ref: 'Workspace',
			required: true
		},
		role: {
			type: String,
			enum: [ADMIN, MEMBER],
			required: true
		},
		status: {
			// INVITED, COMPLETED, GRANTED
			type: String,
			enum: [INVITED, COMPLETED, GRANTED],
			required: true
		}
	},
	{
		timestamps: true
	}
);

const Membership = model<IMembership>('Membership', membershipSchema);

export default Membership;
