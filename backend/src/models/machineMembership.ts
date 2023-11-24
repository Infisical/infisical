import { Schema, Types, model } from "mongoose";
import { ADMIN, CUSTOM, MEMBER, VIEWER } from "../variables";

export interface IMachineMembership {
  _id: Types.ObjectId;
  machineIdentity: Types.ObjectId;
  workspace: Types.ObjectId;
  role: "admin" | "member" | "viewer" | "custom";
  customRole: Types.ObjectId;
}

const machineMembershipSchema = new Schema<IMachineMembership>(
  {
    machineIdentity: {
      type: Schema.Types.ObjectId,
      ref: "MachineIdentity"
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

export const MachineMembership = model<IMachineMembership>("MachineMembership", machineMembershipSchema);