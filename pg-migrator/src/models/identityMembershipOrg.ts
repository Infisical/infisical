import { Schema, Types, model } from "mongoose";

export interface IIdentityMembershipOrg {
  _id: Types.ObjectId;
  identity: Types.ObjectId;
  organization: Types.ObjectId;
  role: "admin" | "member" | "no-access" | "custom";
  customRole: Types.ObjectId;
}

const identityMembershipOrgSchema = new Schema<IIdentityMembershipOrg>(
  {
    identity: {
      type: Schema.Types.ObjectId,
      ref: "Identity",
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
    },
    role: {
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

export const IdentityMembershipOrg = model<IIdentityMembershipOrg>(
  "IdentityMembershipOrg",
  identityMembershipOrgSchema,
);
