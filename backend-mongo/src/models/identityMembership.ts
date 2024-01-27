import { Schema, Types, model } from "mongoose";
import { ADMIN, CUSTOM, MEMBER, NO_ACCESS, VIEWER } from "../variables";

export interface IIdentityMembership {
  _id: Types.ObjectId;
  identity: Types.ObjectId;
  workspace: Types.ObjectId;
  role: "admin" | "member" | "viewer" | "no-access" | "custom";
  customRole: Types.ObjectId;
}

const identityMembershipSchema = new Schema<IIdentityMembership>(
  {
    identity: {
      type: Schema.Types.ObjectId,
      ref: "Identity"
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: [ADMIN, MEMBER, VIEWER, CUSTOM, NO_ACCESS],
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

export const IdentityMembership = model<IIdentityMembership>("IdentityMembership", identityMembershipSchema);