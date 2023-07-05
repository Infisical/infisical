import { Document, Schema, Types, model } from "mongoose";
// membership roles
export const OWNER = "owner";
export const ADMIN = "admin";
export const MEMBER = "member";

// membership statuses
export const INVITED = "invited";

// -- organization
export const ACCEPTED = "accepted";

export interface IMembershipOrg extends Document {
	_id: Types.ObjectId;
	user: Types.ObjectId;
	inviteEmail: string;
	organization: Types.ObjectId;
	role: "owner" | "admin" | "member";
	status: "invited" | "accepted";
}

const membershipOrgSchema = new Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
		},
		inviteEmail: {
			type: String,
		},
		organization: {
			type: Schema.Types.ObjectId,
			ref: "Organization",
		},
		role: {
			type: String,
			enum: [OWNER, ADMIN, MEMBER],
			required: true,
		},
		status: {
			type: String,
			enum: [INVITED, ACCEPTED],
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

const MembershipOrg = model<IMembershipOrg>(
	"MembershipOrg",
	membershipOrgSchema
);

export default MembershipOrg;
