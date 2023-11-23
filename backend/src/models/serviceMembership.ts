import { Schema, Types, model } from "mongoose";
import { ADMIN, CUSTOM, MEMBER, VIEWER } from "../variables";

export interface IServiceMembership {
  _id: Types.ObjectId;
  service: Types.ObjectId;
  workspace: Types.ObjectId;
  role: "admin" | "member" | "viewer" | "custom";
  customRole: Types.ObjectId;
}

const serviceMembershipSchema = new Schema<IServiceMembership>(
  {
    service: { // TODO: consider renaming
      type: Schema.Types.ObjectId,
      ref: "ServiceTokenDataV3"
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
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

export const ServiceMembership = model<IServiceMembership>("ServiceMembership", serviceMembershipSchema);