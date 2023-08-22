import { Schema, Types, model } from "mongoose";
import { ADMIN, CUSTOM, MEMBER, VIEWER } from "../variables";

export interface IMembershipPermission {
  environmentSlug: string;
  ability: string;
}

export interface IMembership {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  inviteEmail?: string;
  workspace: Types.ObjectId;
  role: "admin" | "member" | "viewer" | "custom";
  customRole: Types.ObjectId;
  deniedPermissions: IMembershipPermission[];
}

const membershipSchema = new Schema<IMembership>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    inviteEmail: {
      type: String
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    deniedPermissions: {
      type: [
        {
          environmentSlug: String,
          ability: {
            type: String,
            enum: ["read", "write"]
          }
        }
      ],
      default: []
    },
    role: {
      type: String,
      enum: [ADMIN, MEMBER, VIEWER, CUSTOM],
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

export const Membership = model<IMembership>("Membership", membershipSchema);