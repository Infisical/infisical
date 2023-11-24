import { Schema, Types, model } from "mongoose";
import { ADMIN, CUSTOM, MEMBER } from "../variables";

export interface IMachineMembershipOrg {
  _id: Types.ObjectId;
  machineIdentity: Types.ObjectId;
  organization: Types.ObjectId;
  role: "admin" | "member" | "viewer" | "custom";
  customRole: Types.ObjectId;
}

const machineMembershipOrgSchema = new Schema<IMachineMembershipOrg>(
  {
    machineIdentity: {
      type: Schema.Types.ObjectId,
      ref: "MachineIdentity"
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

export const MachineMembershipOrg = model<IMachineMembershipOrg>("MachineMembershipOrg", machineMembershipOrgSchema);