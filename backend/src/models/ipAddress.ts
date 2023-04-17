import { model, Schema, Types } from "mongoose";

export interface IIpAddress {
  _id: Types.ObjectId;
  ip: string;
  user: Types.ObjectId;
  workspace: Types.ObjectId;
}

const ipAddressSchema = new Schema<IIpAddress>(
  {
      ip: {
      type: String,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

ipAddressSchema.index({ ip: 1, workspace: 1 }, { unique: true });
ipAddressSchema.index({ workspace: 1 });
const IpAddress = model<IIpAddress>("IpAddress", ipAddressSchema);

export default IpAddress;
