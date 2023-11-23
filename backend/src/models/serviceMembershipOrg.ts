import { Schema, Types, model } from "mongoose";
import { ADMIN, CUSTOM, MEMBER } from "../variables";

export interface IServiceMembershipOrg {
  _id: Types.ObjectId;
  service: Types.ObjectId;
  organization: Types.ObjectId;
  role: "admin" | "member" | "viewer" | "custom";
  customRole: Types.ObjectId;
}

const serviceMembershipOrgSchema = new Schema<IServiceMembershipOrg>(
  {
    service: { // TODO: consider renaming
      type: Schema.Types.ObjectId,
      ref: "ServiceTokenDataV3"
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
    customRole: {
      type: Schema.Types.ObjectId,
      ref: "Role"
    }
  },
  {
    timestamps: true
  }
);

export const ServiceMembershipOrg = model<IServiceMembershipOrg>("ServiceMembershipOrg", serviceMembershipOrgSchema);