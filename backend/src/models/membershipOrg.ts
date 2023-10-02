import { Document, Schema, Types, model } from "mongoose";
import { ACCEPTED, ADMIN, CUSTOM, INVITED, MEMBER } from "../variables";

export interface IMembershipOrg extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  inviteEmail: string;
  organization: Types.ObjectId;
  role: "owner" | "admin" | "member" | "custom";
  customRole: Types.ObjectId;
  status: "invited" | "accepted";
}

const membershipOrgSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    inviteEmail: {
      type: String
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization"
    },
    role: {
      type: String,
      enum: [ADMIN, MEMBER, CUSTOM],
      required: true
    },
    status: {
      type: String,
      enum: [INVITED, ACCEPTED],
      required: true
    },
    customRole: {
      type: Schema.Types.ObjectId,
      ref: "Role"
    }
  },
  {
    timestamps: true
  }
);

export const MembershipOrg = model<IMembershipOrg>("MembershipOrg", membershipOrgSchema);
