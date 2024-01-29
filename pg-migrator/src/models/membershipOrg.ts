import { Document, Schema, Types, model } from "mongoose";

export interface IMembershipOrg extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  inviteEmail: string;
  organization: Types.ObjectId;
  role: "admin" | "member" | "no-access" | "custom";
  customRole: Types.ObjectId;
  status: "invited" | "accepted";
  createdAt: string;
  updatedAt: string;
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
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    customRole: {
      type: Schema.Types.ObjectId,
      ref: "Role",
    },
  },
  {
    timestamps: true,
  },
);

export const MembershipOrg = model<IMembershipOrg>(
  "MembershipOrg",
  membershipOrgSchema,
);
