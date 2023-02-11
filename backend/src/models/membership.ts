import { Schema, model, Types } from 'mongoose';
import { ADMIN, MEMBER } from '../variables';

export interface IMembershipPermission {
	environmentSlug: string,
	ability: string
}

export interface IMembership {
	_id: Types.ObjectId;
	user: Types.ObjectId;
	inviteEmail?: string;
	workspace: Types.ObjectId;
	role: 'admin' | 'member';
	deniedPermissions: IMembershipPermission[]
}

const membershipSchema = new Schema<IMembership>(
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
		deniedPermissions: {
			type: [
				{
					environmentSlug: String,
					ability: {
						type: String,
						enum: ['read', 'write']
					},
				},
			],
			default: []
		},
		role: {
			type: String,
			enum: [ADMIN, MEMBER],
			required: true
		}
	},
	{
		timestamps: true
	}
);

const Membership = model<IMembership>('Membership', membershipSchema);

export default Membership;
