import { Document, Schema, Types, model } from "mongoose";
import { ACCEPTED, ADMIN, CUSTOM, INVITED, MEMBER, NO_ACCESS } from "../variables";

export interface IMembershipOrg extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  inviteEmail: string;
  organization: Types.ObjectId;
  role: "admin" | "member" | "no-access" | "custom";
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
      enum: [ADMIN, MEMBER, NO_ACCESS, CUSTOM],
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
